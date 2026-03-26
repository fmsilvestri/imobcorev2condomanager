import { Router, type IRouter } from "express";
import healthRouter from "./health";
import imobcoreRouter from "./imobcore";
import modulosRouter from "./modulos";
import mispRouter from "./misp";
import importacaoRouter from "./importacao";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/misp", mispRouter);
router.use(imobcoreRouter);
router.use(modulosRouter);
router.use(importacaoRouter);

export default router;
