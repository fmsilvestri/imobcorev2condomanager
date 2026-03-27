import { Router, type IRouter } from "express";
import healthRouter      from "./health";
import imobcoreRouter    from "./imobcore";
import modulosRouter     from "./modulos";
import mispRouter        from "./misp";
import importacaoRouter  from "./importacao";
import funcionariosRouter from "./funcionarios";
import conciergeRouter   from "./concierge";
import ttsRouter         from "./tts";
import aguaRouter        from "./agua";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/misp", mispRouter);
router.use(imobcoreRouter);
router.use(modulosRouter);
router.use(importacaoRouter);
router.use(funcionariosRouter);
router.use("/concierge", conciergeRouter);
router.use("/di/tts",    ttsRouter);
router.use(aguaRouter);

export default router;
