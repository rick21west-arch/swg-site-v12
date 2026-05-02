/* Nav injection — marks active page based on current path */
document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;
  document.querySelectorAll('.nav-links a').forEach(a => {
    const href = a.getAttribute('href');
    if (href !== '/' && path.includes(href)) a.classList.add('active');
    if (href === '/' && (path === '/' || path === '/index.html')) a.classList.add('active');
  });
});
