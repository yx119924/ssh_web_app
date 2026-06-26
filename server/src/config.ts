// ============================================================
// 配置文件
// 所有配置项从环境变量读取，没有设置则使用默认值
// 这样做的好处：
//   1. 配置和代码分离
//   2. 不同环境（开发/生产）可以用不同的配置
//   3. 敏感信息（如令牌）不会写死在代码里
// ============================================================

/**
 * 服务器配置的类型定义
 * TypeScript 的 interface 定义了"这个对象长什么样"
 */
export interface ServerConfig {
  /** HTTP/WebSocket 服务器监听的端口号 */
  port: number;
  /** 服务器监听的主机地址 */
  host: string;
  /**
   * 访问控制令牌
   * 如果设置了，客户端连接时必须提供相同的令牌
   * 如果没设置（undefined），则不验证
   */
  accessToken?: string;
  /** SSL 证书文件路径（HTTPS/WSS 需要） */
  sslCert?: string;
  /** SSL 私钥文件路径（HTTPS/WSS 需要） */
  sslKey?: string;
}

/**
 * 获取服务器配置
 * 从环境变量 process.env 中读取，没有则使用默认值
 *
 * 环境变量说明：
 *   SSH_PORT        - 服务器端口，默认 3001
 *   SSH_HOST        - 监听地址，默认 0.0.0.0（接受所有来源的连接）
 *   SSH_ACCESS_TOKEN - 访问令牌，可选
 *   SSL_CERT        - SSL 证书路径，可选
 *   SSL_KEY         - SSL 私钥路径，可选
 */
export function getConfig(): ServerConfig {
  return {
    port: parseInt(process.env.SSH_PORT || '3001', 10),
    host: process.env.SSH_HOST || '0.0.0.0',
    accessToken: process.env.SSH_ACCESS_TOKEN || undefined,
    sslCert: process.env.SSL_CERT || undefined,
    sslKey: process.env.SSL_KEY || undefined,
  };
}
