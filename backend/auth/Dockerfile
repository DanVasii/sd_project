from node:24-alpine
workdir /app
copy package.json ./
RUN npm install -g nodemon
run npm install
copy . .
expose 8000
CMD ["npm", "run", "dev"]