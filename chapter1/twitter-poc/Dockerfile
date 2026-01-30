FROM node:20-alpine

WORKDIR /app
# Copy Zscaler/corporate cert as PEM for SSL verification
COPY certfile.pem /etc/ssl/certs/cacert.pem
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/cacert.pem
COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

CMD ["npm", "run", "start"]
