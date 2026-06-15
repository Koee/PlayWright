declare const __ENV: Record<string, string | undefined>;
declare const __ITER: number;
declare const __VU: number;
declare const console: {
    error(message?: unknown): void;
    log(message?: unknown): void;
};

declare function open(path: string): string;

declare module 'k6/http' {
    export interface RefinedResponse<ResponseType = unknown> {
        status: number;
        body: string | ResponseType;
    }

    export interface Params {
        headers?: Record<string, string>;
        tags?: Record<string, string>;
    }

    export function request(
        method: string,
        url: string,
        body?: string,
        params?: Params
    ): RefinedResponse<string>;

    const http: {
        request: typeof request;
    };

    export default http;
}

declare module 'k6' {
    import type { RefinedResponse } from 'k6/http';

    export function check(
        value: RefinedResponse<string>,
        sets: Record<string, (value: RefinedResponse<string>) => boolean>
    ): boolean;
}

declare module 'k6/metrics' {
    export class Counter {
        constructor(name: string);
        add(value: number): void;
    }

    export class Rate {
        constructor(name: string);
        add(value: boolean): void;
    }
}

declare module 'k6/execution' {
    const exec: {
        scenario: {
            iterationInTest: number;
        };
    };

    export default exec;
}
