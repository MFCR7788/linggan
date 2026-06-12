// Next.js instrumentation — runs at server startup
import { setDefaultResultOrder } from 'dns';

// ECS 无 IPv6 路由，但 DNS 返回 IPv6 地址导致 undici 连接超时
setDefaultResultOrder('ipv4first');
