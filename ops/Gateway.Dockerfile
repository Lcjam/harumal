FROM golang:1.26.5-alpine@sha256:0178a641fbb4858c5f1b48e34bdaabe0350a330a1b1149aabd498d0699ff5fb2 AS builder
WORKDIR /src
COPY ops/gateway/go.mod ops/gateway/go.sum ./
RUN go mod download
COPY ops/gateway/main.go ./main.go
RUN CGO_ENABLED=0 go build -trimpath -o /out/gateway .
RUN mkdir -p /out/data /out/etc/ssl/certs \
    && cp /etc/ssl/certs/ca-certificates.crt /out/etc/ssl/certs/ca-certificates.crt \
    && chown -R 65532:65532 /out/data

FROM scratch
COPY --from=builder /out/gateway /usr/bin/gateway
COPY --from=builder /out/data /data
COPY --from=builder /out/etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
USER 65532:65532
VOLUME ["/data"]
EXPOSE 80 443
ENTRYPOINT ["/usr/bin/gateway"]
