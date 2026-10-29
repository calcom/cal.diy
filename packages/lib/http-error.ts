export class HttpError<TCode extends number = number> extends Error {
  public readonly cause?: Error;
  public readonly statusCode: TCode;
  public readonly message: string;
  public readonly url: string | undefined;
  public readonly method: string | undefined;
  public readonly data?: Record<string, unknown>;

  constructor(opts: {
    url?: string;
    method?: string;
    message?: string;
    statusCode: TCode;
    cause?: Error;
    data?: Record<string, unknown>;
  }) {
    super(opts.message ?? `HTTP Error ${opts.statusCode} `);

    Object.setPrototypeOf(this, HttpError.prototype);
    this.name = HttpError.prototype.constructor.name;

    this.cause = opts.cause;
    this.statusCode = opts.statusCode;
    this.url = opts.url;
    this.method = opts.method;
    this.message = opts.message ?? `HTTP Error ${opts.statusCode}`;
    this.data = opts.data;

    if (opts.cause instanceof Error && opts.cause.stack) {
      this.stack = opts.cause.stack;
    }
  }

  public static fromRequest(
    request: Request,
    response: { url: string; status: number; statusText: string },
    parsedError: Record<string, unknown>
  ) {
    return new HttpError({
      message: response.statusText,
      url: response.url,
      method: request.method,
      statusCode: response.status,
      data: parsedError,
    });
  }
}
