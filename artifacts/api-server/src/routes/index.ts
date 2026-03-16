import { Router, type IRouter } from "express";
import healthRouter from "./health";
import imobcoreRouter from "./imobcore";

const router: IRouter = Router();

router.use(healthRouter);
router.use(imobcoreRouter);

export default router;
