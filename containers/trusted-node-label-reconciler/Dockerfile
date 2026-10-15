FROM mcr.microsoft.com/azurelinux/base/nodejs@sha256:b4f6866da0977e1bbf9ad4c5cdf265cb841bca03dcc2ea55cfa6a71ab655860b

LABEL org.opencontainers.image.source="https://github.com/kerberosmansour/hulumi"

WORKDIR /app
ENV NODE_ENV=production

# The build context is the script-disabled, production-only `pnpm deploy`
# output. This stage deliberately installs nothing and retains the base RPM
# database plus npm package metadata so admission scanners see the full graph.
COPY --chown=65532:65532 . /app

USER 65532:65532
ENTRYPOINT ["node", "/app/dist/trusted-node-label-controller-main.js"]
