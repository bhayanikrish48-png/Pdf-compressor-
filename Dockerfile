FROM node:18-slim

# Ghostscript does the real PDF compression work (image downsampling,
# font subsetting, stream recompression). It's installed here so you
# never need to install anything yourself.
RUN apt-get update && \
    apt-get install -y --no-install-recommends ghostscript && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY . .

RUN mkdir -p tmp/uploads tmp/output

ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
