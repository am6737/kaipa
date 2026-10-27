# Media scrubber: node + exiftool. Alpine's `exiftool` package carries the CLI
# (`perl-image-exiftool` alone is only the Perl modules).
FROM node:22-alpine
RUN apk add --no-cache exiftool && exiftool -ver
COPY media-scrubber.mjs /app/media-scrubber.mjs
USER node
CMD ["node", "/app/media-scrubber.mjs"]
