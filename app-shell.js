(function () {
    'use strict';

    function readSession() {
        try { return JSON.parse(localStorage.getItem('session') || 'null'); }
        catch (error) { return null; }
    }

    function init(requiredPermission) {
        var session = readSession();
        if (!session || !session.user || session.user.must_change_password) {
            window.location.href = 'index.html';
            return null;
        }

        var user = session.user;
        var isAdmin = user.role === 'admin';
        var permissions = user.permissions || {};
        if (!isAdmin && requiredPermission && !permissions[requiredPermission]) {
            document.querySelector('main').innerHTML = '<div class="empty">ليس لديك صلاحية عرض هذه الصفحة.</div>';
            return null;
        }

        document.querySelectorAll('.sidebar-link[data-perm]').forEach(function (link) {
            if (!isAdmin && !permissions[link.dataset.perm]) link.style.display = 'none';
        });
        var adminLink = document.getElementById('adminLink');
        if (adminLink && isAdmin) adminLink.style.display = 'flex';

        var displayName = user.full_name || user.username || 'المستخدم';
        var avatar = displayName.charAt(0).toUpperCase();
        document.querySelectorAll('[data-user-name]').forEach(function (element) { element.textContent = displayName; });
        document.querySelectorAll('[data-user-avatar]').forEach(function (element) { element.textContent = avatar; });
        var role = document.getElementById('userRole');
        if (role) role.textContent = isAdmin ? 'مدير' : 'موظف';

        var theme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', theme);
        var themeButton = document.getElementById('themeToggle');
        function updateThemeIcon() {
            var icon = themeButton && themeButton.querySelector('i');
            if (icon) icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        }
        updateThemeIcon();
        if (themeButton) themeButton.addEventListener('click', function () {
            theme = theme === 'dark' ? 'light' : 'dark';
            localStorage.setItem('theme', theme);
            document.documentElement.setAttribute('data-theme', theme);
            updateThemeIcon();
        });

        var menuButton = document.getElementById('menuBtn');
        var sidebar = document.getElementById('sidebar');
        var overlay = document.getElementById('sidebarOverlay');
        function closeSidebar() {
            if (sidebar) sidebar.classList.remove('show');
            if (overlay) overlay.classList.remove('show');
        }
        if (menuButton) menuButton.addEventListener('click', function () {
            if (sidebar) sidebar.classList.toggle('show');
            if (overlay) overlay.classList.toggle('show');
        });
        if (overlay) overlay.addEventListener('click', closeSidebar);
        if (sidebar) sidebar.querySelectorAll('a').forEach(function (link) { link.addEventListener('click', closeSidebar); });

        var onlineDot = document.getElementById('onlineDot');
        function updateOnline() { if (onlineDot) onlineDot.classList.toggle('offline', !navigator.onLine); }
        updateOnline();
        window.addEventListener('online', updateOnline);
        window.addEventListener('offline', updateOnline);

        var userButton = document.getElementById('userBtn');
        var userMenu = document.getElementById('userDropdown');
        if (userButton && userMenu) userButton.addEventListener('click', function () { userMenu.classList.toggle('show'); });
        var logoutButton = document.getElementById('logoutBtn');
        if (logoutButton) logoutButton.addEventListener('click', function () {
            localStorage.removeItem('session');
            window.location.href = 'index.html';
        });
        document.addEventListener('click', function (event) {
            if (userMenu && userButton && !userMenu.contains(event.target) && !userButton.contains(event.target)) userMenu.classList.remove('show');
        });
        return session;
    }

    window.TopLoadShell = { init: init };
})();
