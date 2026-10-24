/**
 * RFC 7807 ProblemDetails 统一错误模型
 * 对应需求文档「@RestControllerAdvice + RFC 7807」
 */

class ApiError extends Error {
  constructor(status, title, detail, extra = {}) {
    super(detail || title);
    this.status = status;
    this.title = title;
    this.extra = extra;
  }
}

const notFound = (detail) => new ApiError(404, '资源不存在', detail);
const badRequest = (detail) => new ApiError(400, '请求参数错误', detail);
const unauthorized = (detail) => new ApiError(401, '未认证', detail);
const forbidden = (detail) => new ApiError(403, '禁止访问', detail);
const conflict = (detail) => new ApiError(409, '冲突', detail);
const unprocessable = (detail, extra) => new ApiError(422, '内容审核未通过', detail, extra);
const tooMany = (detail) => new ApiError(429, '请求过于频繁', detail);

function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  const problem = {
    type: err.type || 'about:blank',
    title: err.title || (status >= 500 ? '服务器内部错误' : '请求失败'),
    status,
    detail: status >= 500 && !err.title ? '服务器内部错误' : err.message,
    instance: req.originalUrl,
    ...err.extra,
  };
  if (status >= 500) console.error('[error]', err);
  res.status(status).type('application/problem+json').json(problem);
}

module.exports = { ApiError, notFound, badRequest, unauthorized, forbidden, conflict, unprocessable, tooMany, errorHandler };
