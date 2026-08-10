// Password protection on the Porch archive — removed, no longer needed.
export const config = {
  matcher: ['/the-porch/archive', '/the-porch/archive/:path*'],
};

export default function middleware() {
  return;
}
