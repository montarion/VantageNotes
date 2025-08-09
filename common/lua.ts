import { luaparse } from "npm:luaparse";
import { Logger } from "./logger.ts";

const log = new Logger({ namespace: "Pane", minLevel: "debug" });

export function runLua(code){
    var ast = luaparse.parse(code);
    log.debug(ast)
}
