#!/usr/bin/env bun

import { spawn } from 'bun';
import { log } from './utils';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const batch1 = 'concurrently -n gateway,auth,users,orgs,analytics,notif -c cyan,blue,green,yellow,magenta,red "cd ../core-api-gateway && bun dev" "cd ../core-auth-service && bun dev" "cd ../core-user-service && bun dev" "cd ../core-organization-service && bun dev" "cd ../core-analytics-service && bun dev" "cd ../core-notification-service && bun dev"';

const batch2 = 'concurrently -n patterns,interact,chat,mcp,billing,a2a -c cyan,blue,green,yellow,magenta,red "cd ../core-pattern-service && bun dev" "cd ../core-interaction-service && bun dev" "cd ../bff-chat-service && bun dev" "cd ../mcp-service && bun dev" "cd ../core-billing-service && bun dev" "cd ../a2a-service && bun dev"';

const batch3 = 'concurrently -n ingest,dashboard,landing,auth-ui,rogue -c cyan,blue,green,yellow,magenta "cd ../web-ingest-service && bun dev" "cd ../dashboard-client && bun dev" "cd ../landing-client && bun dev" "cd ../auth-client && bun dev" "cd ../rogue-store && pnpm dev"';

const batch4 = 'concurrently -n products,qna -c cyan,blue "cd ../core-product-service && bun dev" "cd ../bff-qna-service && bun dev"';

const procs: ReturnType<typeof spawn>[] = [];

const run = (cmd: string) => procs.push(spawn(['sh', '-c', cmd], { stdio: ['inherit', 'inherit', 'inherit'] }));

const main = async () => {
  log.info('[batch 1/4] Starting core services...');
  run(batch1);
  await sleep(2000);

  log.info('[batch 2/4] Starting more services...');
  run(batch2);
  await sleep(2000);

  log.info('[batch 3/4] Starting frontends + ingest...');
  run(batch3);
  await sleep(5000);

  log.info('[batch 4/4] Starting cloud-dependent services (AI/Vectorize)...');
  run(batch4);

  process.on('SIGINT', () => { procs.forEach(p => p.kill()); process.exit(0); });
  await new Promise(() => {});
};

main();
