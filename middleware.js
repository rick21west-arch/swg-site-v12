export const config = {
  matcher: ['/the-porch/archive', '/the-porch/archive/:path*'],
};

export default function middleware(request) {
  const password = 'jeanpaul';
  const auth = request.headers.get('authorization');

  if (auth) {
    const encoded = auth.split(' ')[1] || '';
    let decoded = '';
    try {
      decoded = atob(encoded);
    } catch (e) {
      decoded = '';
    }
    const suppliedPassword = decoded.split(':')[1] || '';
    if (suppliedPassword === password) {
      return;
    }
  }

  return new Response('Password required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="The Porch Archive"',
    },
  });
}
