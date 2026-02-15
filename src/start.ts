#!/usr/bin/env bun

import { spawn } from 'bun';
import { log } from './utils';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const batch1 = 'concurrently -n gateway,auth,users,orgs,notif,billing -c cyan,blue,green,yellow,magenta,red "cd ../core-api-gateway && bun dev" "cd ../core-auth-service && bun dev" "cd ../core-user-service && bun dev" "cd ../core-organization-service && bun dev" "cd ../core-notification-service && bun dev" "cd ../core-billing-service && bun dev"';

const batch2 = 'concurrently -n products,crawl,interact,patterns -c cyan,blue,green,yellow "cd ../core-product-service && bun dev" "cd ../infra-crawl-service && bun dev" "cd ../core-interaction-service && bun dev" "cd ../core-pattern-service && bun dev"';

const batch3 = 'concurrently -n auth-ui,dashboard -c cyan,blue "cd ../auth-client && bun dev" "cd ../dashboard-client && bun dev"';

const batch4 = 'concurrently -n analytics,chat,mcp,qna,a2a,ingest,landing,rogue -c cyan,blue,green,yellow,magenta,red,white,gray "cd ../core-analytics-service && bun dev" "cd ../bff-chat-service && bun dev" "cd ../mcp-service && bun dev" "cd ../bff-qna-service && bun dev" "cd ../a2a-service && bun dev" "cd ../web-ingest-service && bun dev" "cd ../landing-client && bun dev" "cd ../rogue-store && pnpm dev"';

const procs: ReturnType<typeof spawn>[] = [];

const run = (cmd: string) => procs.push(spawn(['sh', '-c', cmd], { stdio: ['inherit', 'inherit', 'inherit'] }));

  const main = async () => {
    log.info('[batch 1/4] Starting CRITICAL auth/onboarding services...');
    log.info('  → Auth, User, Organization, Notification, Billing');
    run(batch1);
    await sleep(3000);

    log.info('[batch 2/4] Starting Product & Crawl services...');
    log.info('  → Product Service, Infra Crawl Service, Interactions, Patterns');
    run(batch2);
    await sleep(3000);

    log.info('[batch 3/4] Starting Frontends (Auth Client + Dashboard)...');
    run(batch3);
    await sleep(5000);

    log.info('[batch 4/4] Starting optional services...');
    log.info('  → Analytics, Chat, MCP, QnA, A2A, Ingest, Landing, Rogue Store');
    run(batch4);

    log.info('✅ All services started!');
    log.info('🔗 Auth Client: http://localhost:3001');
    log.info('🔗 Dashboard: http://localhost:3002');
    log.info('🔗 API Gateway: http://localhost:8000');

    process.on('SIGINT', () => { procs.forEach(p => p.kill()); process.exit(0); });
    await new Promise(() => { });
  };

  main();
