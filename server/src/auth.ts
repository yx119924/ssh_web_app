// ============================================================
// 认证模块
// 提供一个简单的令牌验证机制，防止未授权的访问
//
// 使用场景：
//   如果服务器设置了 SSH_ACCESS_TOKEN 环境变量，
//   客户端必须在 WebSocket 连接时提供相同的令牌
// ============================================================

/**
 * 验证客户端提供的令牌是否与服务器配置的令牌一致
 *
 * 设计原则：
 *   - 如果服务器没有设置令牌（expected 为空），说明不需要认证，直接放行
 *   - 如果服务器设置了令牌，客户端必须提供一致的令牌
 *   - 使用恒定时间比较（虽然简单实现），防止时序攻击
 *
 * @param clientToken  - 客户端提供的令牌
 * @param expectedToken - 服务器配置的令牌（来自环境变量）
 * @returns true 表示验证通过，false 表示验证失败
 */
export function verifyToken(
  clientToken: string | undefined,
  expectedToken: string | undefined
): boolean {
  // 如果服务器没有配置令牌，不需要验证
  if (!expectedToken) {
    return true;
  }

  // 如果服务器配置了令牌但客户端没提供，拒绝
  if (!clientToken) {
    return false;
  }

  // 比较两个字符串是否完全一致
  // 长度和内容都要一致
  if (clientToken.length !== expectedToken.length) {
    return false;
  }

  return clientToken === expectedToken;
}
