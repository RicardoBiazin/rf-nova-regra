// O Simples Nacional não tem API pública; na web a tela mostra o aviso. Esta função devolve 501 explícito.
export default async (): Promise<Response> =>
  new Response(
    JSON.stringify({
      title: 'Disponível apenas no aplicativo desktop',
      status: 501,
      detail: 'A calculadora do Simples Nacional roda localmente no aplicativo desktop (RF Nova Regra).',
    }),
    { status: 501, headers: { 'content-type': 'application/problem+json', 'cache-control': 'no-store' } },
  );

export const config = { path: '/api/sn/*' };
