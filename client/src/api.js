import axios from "axios";

// All API calls go through this instance; the JWT lives in an httpOnly
// cookie, so withCredentials must be on for every request.
const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

export default api;
