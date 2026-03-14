# dyno

Dyno is a web app for car enthusiasts to track and manage cars they've seen, driven, or owned.

## What it does

Dyno lets you build and maintain a personal catalogue of cars. For each car you can record:

- **Manufacturer** – chosen from a curated list (Toyota, Honda, Ford, BMW, Tesla, and more)
- **Model** – dynamically filtered to the models available for the selected manufacturer
- **Year**
- **Transmission** – Manual or Automatic

From the car list you can **add**, **edit**, and **delete** entries. Planned sections for *Experiences* and *Friends* will let you log what it was like behind the wheel and share your collection with others.

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Axios |
| Backend | Node.js, Express 4 |
| Database | MongoDB (Mongoose 8) |
| Dev tooling | Create React App, Nodemon |

## Project structure

```
dyno/
└── dyno-react-app/
    ├── src/          # React frontend
    └── backend/      # Express API server
```

## Getting started

### Prerequisites

- Node.js (v16+)
- MongoDB running locally on the default port (`27017`)

### Backend

```bash
cd dyno-react-app/backend
npm install
node seed.js        # populate manufacturers and sample cars
npm run dev         # starts the API server on port 5000
```

### Frontend

```bash
cd dyno-react-app
npm install
npm start           # starts the React dev server on port 3000
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/manufacturers` | List all manufacturers |
| `GET` | `/api/cars` | List all cars |
| `POST` | `/api/cars` | Add a new car |
| `PUT` | `/api/cars/:id` | Update a car |
| `DELETE` | `/api/cars/:id` | Delete a car |
