import { Hono } from "hono";
import { serverCache } from "@middlewares/cache";
import mainController from "@controllers/mainController";

const mainRoute = new Hono();

mainRoute.get("/", (c) => mainController.getMainView(c));
mainRoute.get("/view-data", serverCache(), (c) => mainController.getMainViewData(c));

export default mainRoute;
