FROM node:24.19.0-bookworm@sha256:4196d66a565c6f195728d9952f161f4adfe2ad753052a08b7ec7f1c5a6bda42b

RUN apt-get update \
    && apt-get install -y --no-install-recommends sudo ripgrep less \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global npm@12.0.2 \
    && printf 'node ALL=(root) NOPASSWD: /usr/bin/chown\n' > /etc/sudoers.d/node-volumes \
    && chmod 0440 /etc/sudoers.d/node-volumes

ENV NEXT_TELEMETRY_DISABLED=1
USER node
WORKDIR /workspaces/laser-focus
