FROM alpine:3.24@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b AS builder

ARG PG_VERSION=17.10
ARG PG_SHA256=078a03516dcdbdb705fecaf415ea3d13a956c589e46f09fed68a06fb00598c90

RUN apk add --no-cache bison build-base flex linux-headers openssl-dev perl tzdata zlib-dev
WORKDIR /build
RUN wget -q "https://ftp.postgresql.org/pub/source/v${PG_VERSION}/postgresql-${PG_VERSION}.tar.bz2" \
    && echo "${PG_SHA256}  postgresql-${PG_VERSION}.tar.bz2" | sha256sum -c - \
    && tar -xjf "postgresql-${PG_VERSION}.tar.bz2"
WORKDIR /build/postgresql-17.10

# Harumal uses ordinary UTF-8 text and pgcrypto, but none of PostgreSQL's XML,
# LDAP, GSSAPI, ICU, LLVM, or procedural-language integrations. Omitting those
# parsers and clients reduces both the image and its remotely reachable surface.
RUN ./configure \
      --prefix=/usr/local \
      --with-pgport=5432 \
      --with-system-tzdata=/usr/share/zoneinfo \
      --with-unix-socket-directories=/var/run/postgresql \
      --with-openssl \
      --without-icu \
      --without-libxml \
      --without-lz4 \
      --without-readline \
      --without-zstd \
    && make -j"$(getconf _NPROCESSORS_ONLN)" all \
    && make install DESTDIR=/out \
    && make -C contrib/pgcrypto all \
    && make -C contrib/pgcrypto install DESTDIR=/out

FROM postgres:17-alpine@sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193 AS upstream

FROM alpine:3.24@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b
RUN apk add --no-cache bash ca-certificates libcrypto3 libssl3 tzdata zlib \
    && addgroup -g 70 -S postgres \
    && adduser -u 70 -S -D -H -G postgres postgres \
    && mkdir -p /docker-entrypoint-initdb.d /var/lib/postgresql/data /var/run/postgresql \
    && chown -R postgres:postgres /var/lib/postgresql /var/run/postgresql

COPY --from=builder /out/usr/local /usr/local
COPY --from=upstream /usr/local/bin/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN echo "listen_addresses = '*'" >> /usr/local/share/postgresql/postgresql.conf.sample

ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    LANG=en_US.utf8 \
    PG_MAJOR=17 \
    PG_VERSION=17.10 \
    PGDATA=/var/lib/postgresql/data

USER postgres
WORKDIR /
VOLUME ["/var/lib/postgresql/data"]
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["postgres"]
EXPOSE 5432
STOPSIGNAL SIGINT
