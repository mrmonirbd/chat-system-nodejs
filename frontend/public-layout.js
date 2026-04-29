(function () {
    function homeAnchor(hash) {
        return window.location.pathname === '/' ? hash : `/${hash}`;
    }

    function isActive(path) {
        return window.location.pathname === path;
    }

    function navLink(href, label, activePath) {
        const activeClass = activePath && isActive(activePath) ? 'nav-link-active' : '';
        return `<a class="${activeClass}" href="${href}">${label}</a>`;
    }

    function mobileLink(href, label, activePath) {
        const activeClass = activePath && isActive(activePath) ? 'mobile-menu-link-active' : '';
        return `<a class="mobile-menu-link ${activeClass}" href="${href}">${label}</a>`;
    }

    window.togglePublicMenu = function togglePublicMenu() {
        const menu = document.getElementById('mobileMenu');
        if (!menu) return;
        menu.classList.toggle('is-hidden');
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
                    <button type="button" class="hamburger-button" onclick="togglePublicMenu()" aria-label="Open menu">
                        <span>☰</span>
                    </button>
                </nav>
                <div id="mobileMenu" class="container mobile-menu is-hidden">
                    <div class="mobile-menu-panel">
                        ${mobileLink('/', 'Home', '/')}
                        ${mobileLink('/about', 'About', '/about')}
                        ${mobileLink(featuresHref, 'Features')}
                        ${mobileLink(pricingHref, 'Pricing')}
                        ${mobileLink('/contact', 'Contact', '/contact')}
                        <a class="mobile-login-link" href="/login">Login</a>
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
