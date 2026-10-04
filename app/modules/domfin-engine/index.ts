import { requireOptionalNativeModule } from 'expo';

type DomfinEngineModule = {
  /** Starts the engine, if it isn't running, and returns its port on 127.0.0.1. */
  start(): Promise<number>;
};

/**
 * Domfin's engine inside the app (api/mobile), or null where it isn't built
 * in: the web, Android and builds without it talk to domfin-api.
 */
export const DomfinEngine = requireOptionalNativeModule<DomfinEngineModule>('DomfinEngine');
