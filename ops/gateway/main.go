package main

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"golang.org/x/crypto/acme/autocert"
)

const upstreamAddress = "http://app:3000"

// CrewDeal is a separate stack on the same VM. Its app container joins the frontend network
// under this alias; set CREWDEAL_HOST to route that hostname to it. Empty keeps the gateway
// single-site.
const defaultCrewDealUpstream = "http://crewdeal-app:8080"

func crewDealHost() string {
	return strings.ToLower(strings.TrimSpace(os.Getenv("CREWDEAL_HOST")))
}

func siteURL() (*url.URL, error) {
	raw := strings.TrimSpace(os.Getenv("SITE_ADDRESS"))
	if raw == "" {
		raw = "http://localhost"
	} else if !strings.Contains(raw, "://") {
		raw = "https://" + raw
	}

	parsed, err := url.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("parse SITE_ADDRESS: %w", err)
	}
	if (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Hostname() == "" {
		return nil, errors.New("SITE_ADDRESS must be an HTTP or HTTPS origin")
	}
	if parsed.User != nil || (parsed.Path != "" && parsed.Path != "/") || parsed.RawQuery != "" || parsed.Fragment != "" {
		return nil, errors.New("SITE_ADDRESS cannot contain credentials, a path, query, or fragment")
	}
	return parsed, nil
}

func newProxy(site *url.URL, upstreamRaw string, cacheNextAssets bool) *httputil.ReverseProxy {
	upstream, err := url.Parse(upstreamRaw)
	if err != nil {
		panic(err)
	}

	return &httputil.ReverseProxy{
		Rewrite: func(request *httputil.ProxyRequest) {
			request.Out.Header.Del("Forwarded")
			request.Out.Header.Del("X-Forwarded-For")
			request.Out.Header.Del("X-Forwarded-Host")
			request.Out.Header.Del("X-Forwarded-Proto")
			request.SetURL(upstream)
			request.SetXForwarded()
			request.Out.Host = request.In.Host
		},
		ErrorLog: log.New(os.Stderr, "gateway: ", 0),
		ErrorHandler: func(response http.ResponseWriter, _ *http.Request, _ error) {
			http.Error(response, "Service temporarily unavailable", http.StatusBadGateway)
		},
		ModifyResponse: func(response *http.Response) error {
			response.Header.Set("X-Content-Type-Options", "nosniff")
			response.Header.Set("Referrer-Policy", "strict-origin-when-cross-origin")
			response.Header.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
			response.Header.Del("Server")
			if site.Scheme == "https" {
				response.Header.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
			} else {
				response.Header.Del("Strict-Transport-Security")
			}
			path := response.Request.URL.Path
			if cacheNextAssets && (strings.HasPrefix(path, "/_next/static/") || path == "/favicon.svg" || path == "/og.png") {
				response.Header.Set("Cache-Control", "public, max-age=31536000, immutable")
			}
			return nil
		},
	}
}

func gatewayHandler(site *url.URL) http.Handler {
	proxy := newProxy(site, upstreamAddress, true)

	crewHost := crewDealHost()
	var crewProxy *httputil.ReverseProxy
	if crewHost != "" {
		upstream := strings.TrimSpace(os.Getenv("CREWDEAL_UPSTREAM"))
		if upstream == "" {
			upstream = defaultCrewDealUpstream
		}
		crewProxy = newProxy(site, upstream, false)
	}

	expectedHost := site.Host
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		target := proxy
		if crewProxy != nil && strings.EqualFold(hostWithoutPort(request.Host), crewHost) {
			target = crewProxy
		} else if !strings.EqualFold(request.Host, expectedHost) {
			http.Error(response, "Misdirected request", http.StatusMisdirectedRequest)
			return
		}
		if request.Method == http.MethodConnect || request.Method == "TRACE" || request.Method == "TRACK" {
			response.Header().Set("Allow", "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS")
			http.Error(response, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		// CrewDeal has no page at "/" (every API needs a session), so send visitors to its console.
		if target == crewProxy && request.URL.Path == "/" {
			http.Redirect(response, request, "/console/index.html", http.StatusFound)
			return
		}

		target.ServeHTTP(response, request)
	})
}

func hostWithoutPort(host string) string {
	if index := strings.LastIndex(host, ":"); index != -1 && !strings.Contains(host[index:], "]") {
		return host[:index]
	}
	return host
}

func server(address string, handler http.Handler) *http.Server {
	return &http.Server{
		Addr:              address,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       90 * time.Second,
		MaxHeaderBytes:    32 << 10,
	}
}

func main() {
	site, err := siteURL()
	if err != nil {
		log.Fatal(err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	errorsChannel := make(chan error, 2)
	handler := gatewayHandler(site)
	var servers []*http.Server

	if site.Scheme == "http" {
		port := site.Port()
		if port == "" {
			port = "80"
		}
		httpServer := server(":"+port, handler)
		servers = append(servers, httpServer)
		go func() { errorsChannel <- httpServer.ListenAndServe() }()
	} else {
		hosts := []string{site.Hostname()}
		if crewHost := crewDealHost(); crewHost != "" {
			hosts = append(hosts, crewHost)
		}
		manager := &autocert.Manager{
			Prompt:     autocert.AcceptTOS,
			HostPolicy: autocert.HostWhitelist(hosts...),
			Cache:      autocert.DirCache("/data/certs"),
			Email:      strings.TrimSpace(os.Getenv("ACME_EMAIL")),
		}
		httpServer := server(":80", manager.HTTPHandler(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
			host := site.Host
			if crewHost := crewDealHost(); crewHost != "" && strings.EqualFold(hostWithoutPort(request.Host), crewHost) {
				host = crewHost
			}
			target := "https://" + host + request.URL.RequestURI()
			http.Redirect(response, request, target, http.StatusPermanentRedirect)
		})))
		httpsServer := server(":443", handler)
		httpsServer.TLSConfig = manager.TLSConfig()
		httpsServer.TLSConfig.MinVersion = tls.VersionTLS12
		servers = append(servers, httpServer, httpsServer)
		go func() { errorsChannel <- httpServer.ListenAndServe() }()
		go func() { errorsChannel <- httpsServer.ListenAndServeTLS("", "") }()
	}

	log.Printf("secure gateway started for %s", site.Redacted())
	select {
	case <-ctx.Done():
	case err := <-errorsChannel:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("gateway stopped unexpectedly: %v", err)
		}
	}

	shutdownContext, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	for _, runningServer := range servers {
		if err := runningServer.Shutdown(shutdownContext); err != nil {
			log.Printf("gateway shutdown: %v", err)
		}
	}
}
