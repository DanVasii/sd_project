from node:20
workdir /app
copy package.json ./
run npm install
copy . .
expose 5173
CMD ["npm", "run", "dev"]
