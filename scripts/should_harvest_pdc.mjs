#!/usr/bin/env node
/**
 * Checagem BARATA de "é hora de coletar prováveis agora?" — separada do
 * harvest_pdc.mjs de propósito, pra rodar num job do GitHub Actions que
 * NÃO instala Playwright/Chromium (só precisa de Node + fetch). Usada
 * pelo workflow harvest-pdc-frequente.yml: dispara a cada 2h o ano
 * inteiro, mas só o job pesado (com navegador de verdade) roda quando
 * este script imprime "sim" — ver deveColetarAgora() em harvest_pdc.mjs
 * pra entender a regra (janela densa de 48h antes do próximo jogo,
 * manutenção a cada 6h fora dela).
 *
 * Imprime só "sim" ou "nao" em stdout (pro shell capturar limpo);
 * o motivo da decisão vai pro stderr, só pra ficar no log.
 */
import { deveColetarAgora } from "./harvest_pdc.mjs";

const { sim, motivo } = await deveColetarAgora();
console.error(`[should_harvest_pdc] ${sim ? "SIM" : "não"} — ${motivo}`);
process.stdout.write(sim ? "sim" : "nao");
