/* ═══════════════════════════════════════════
   GIEESKRECIPES — Navigation
═══════════════════════════════════════════ */
function initNav() {
  var nav    = document.getElementById('nav');
  var burger = document.getElementById('navBurger');
  var mobile = document.getElementById('navMobile');

  // Scroll effect
  window.addEventListener('scroll', function() {
    if (window.scrollY > 60) nav.classList.add('scrolled');
    else nav.classList.remove('scrolled');
  }, { passive: true });

  // Mobile burger menu
  if (burger) {
    burger.addEventListener('click', function() {
      burger.classList.toggle('open');
      if (mobile) mobile.classList.toggle('open');
    });
  }

  // Close mobile menu on link click
  if (mobile) {
    mobile.querySelectorAll('a').forEach(function(a) {
      a.addEventListener('click', function() {
        burger.classList.remove('open');
        mobile.classList.remove('open');
      });
    });
  }

  // Sign In / Sign Up buttons
  var btnLogin = document.getElementById('btnLogin');
  if (btnLogin) btnLogin.addEventListener('click', function() {
    openAuthModal('login');
  });
  var btnSignup = document.getElementById('btnSignup');
  if (btnSignup) btnSignup.addEventListener('click', function() {
    openAuthModal('signup');
  });
}
