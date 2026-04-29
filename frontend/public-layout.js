(function () {
    function homeAnchor(hash) {
        return window.location.pathname === '/' ? hash : `/${hash}`;
    }

    function isActive(path) {
        return window.location.pathname === path;
    }

    function navLink(href, label, activePath) {
        const activeClass = activePath && isActive(activePath) ? 'font-extrabold text-teal-700' : '';
        return `<a class="${activeClass}" href="${href}">${label}</a>`;
    }

    function mobileLink(href, label, activePath) {
        const activeClass = activePath && isActive(activePath) ? 'bg-teal-50 text-teal-700' : 'hover:bg-teal-50';
        return `<a class="rounded-lg px-3 py-2 ${activeClass}" href="${href}">${label}</a>`;
    }

    window.togglePublicMenu = function togglePublicMenu() {
        const menu = document.getElementById('mobileMenu');
        if (!menu) return;
        menu.classList.toggle('hidden');
    };

    function renderHeader() {
        const headerRoot = document.getElementById('publicHeader');
        if (!headerRoot) return;

        const featuresHref = homeAnchor('#features');
        const pricingHref = homeAnchor('#pricing');

        headerRoot.innerHTML = `
            <header class="site-header">
                <nav class="container nav">
                    <a class="brand" href="/">
                        <span class="brand-mark">C</span>
                        <span>Chat System</span>
                    </a>
                    <div class="nav-links">
                        ${navLink('/', 'Home', '/')}
                        ${navLink('/about', 'About', '/about')}
                        ${navLink(featuresHref, 'Features')}
                        ${navLink(pricingHref, 'Pricing')}
                        ${navLink('/contact', 'Contact', '/contact')}
                    </div>
                    <div class="nav-actions">
                        <a class="btn btn-primary" href="/login">Login</a>
                    </div>
                    <button type="button" class="hamburger-button items-center justify-center w-11 h-11 rounded-lg border border-teal-100 bg-white text-teal-700 shadow-sm" onclick="togglePublicMenu()" aria-label="Open menu">
                        <span class="text-2xl leading-none">☰</span>
                    </button>
                </nav>
                <div id="mobileMenu" class="container hidden pb-4">
                    <div class="rounded-xl border border-teal-100 bg-white p-3 shadow-lg flex flex-col gap-2 text-sm font-semibold text-slate-700">
                        ${mobileLink('/', 'Home', '/')}
                        ${mobileLink('/about', 'About', '/about')}
                        ${mobileLink(featuresHref, 'Features')}
                        ${mobileLink(pricingHref, 'Pricing')}
                        ${mobileLink('/contact', 'Contact', '/contact')}
                        <a class="rounded-lg px-3 py-2 bg-teal-600 text-white text-center" href="/login">Login</a>
                    </div>
                </div>
            </header>
        `;
    }

    function renderFooter() {
        const footerRoot = document.getElementById('publicFooter');
        if (!footerRoot) return;

        footerRoot.innerHTML = `
            <footer class="site-footer">
                <div class="container footer-row">
                    <p>© 2026 Chat System. All rights reserved.</p>
                    <p><a href="/about">About</a> · <a href="/contact">Contact</a> · <a href="/login">Login</a></p>
                </div>
            </footer>
        `;
    }

    document.addEventListener('DOMContentLoaded', () => {
        renderHeader();
        renderFooter();
    });
})();
