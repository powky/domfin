import { requireOptionalNativeModule } from 'expo';

type DomfinEngineModule = {
  /**
   * Starts the engine, if it isn't running: its port on 127.0.0.1 and the
   * token each request carries (other apps on the phone reach 127.0.0.1 too).
   */
  start(): Promise<{ port: number; token: string }>;
};

/**
 * Domfin's engine inside the app (api/mobile), or null where it isn't built
 * in: the web and builds without it talk to domfin-api.
 */
export const DomfinEngine = requireOptionalNativeModule<DomfinEngineModule>('DomfinEngine');
