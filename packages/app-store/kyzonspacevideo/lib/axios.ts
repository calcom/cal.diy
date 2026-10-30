import axios from "axios";

export const kyzonBaseUrl = "https://kyzonsolutions.com/api/cloud";

export const kyzonAxiosInstance = axios.create({
  baseURL: kyzonBaseUrl,
  timeout: 10000, // align with other axios instances to enforce a 10 s timeout
  headers: { "User-Agent": "Cal.com-KYZON-Space/1.0" },
});
