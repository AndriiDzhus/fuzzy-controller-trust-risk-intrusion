# Node.js 22 (Alpine) with git to clone the app from GitHub at start-up.
FROM node:22-alpine

RUN apk add --no-cache git

COPY run.sh /run.sh
RUN chmod +x /run.sh

# /data is the add-on's persistent folder (survives restarts): the app and its
# node_modules are cached there, so a restart only pulls changes.
WORKDIR /data
CMD [ "/run.sh" ]
