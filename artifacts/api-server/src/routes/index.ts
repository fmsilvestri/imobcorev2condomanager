import { Router, type IRouter } from "express";
import healthRouter from "./health";
import imobcoreRouter from "./imobcore";
import modulosRouter from "./modulos";

const router: IRouter = Router();

router.use(healthRouter);
router.use(imobcoreRouter);
router.use(modulosRouter);

export default router;
