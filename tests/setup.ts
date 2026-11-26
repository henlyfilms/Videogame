// Global test setup: give jsdom a no-op Canvas 2D context so renderer code can run.
import { installCanvasMock } from './canvasMock';

installCanvasMock();
