/// <reference lib="webworker" />
import type { WorkerRequest } from '../protocol.ts';
import { handleRequest } from './handler.ts';

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { response, transfer } = handleRequest(e.data);
  scope.postMessage(response, transfer);
};
