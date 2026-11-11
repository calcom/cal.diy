import process from "node:process";
export const isENVProd = process.env.NODE_ENV === "production";
export const isENVDev = process.env.NODE_ENV === "development";
