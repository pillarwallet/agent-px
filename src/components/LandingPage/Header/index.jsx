/* eslint-disable react/self-closing-comp */
/* eslint-disable jsx-a11y/control-has-associated-label */
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
/* eslint-disable jsx-a11y/anchor-is-valid */
import { useEffect, useState } from 'react';
import { Link, NavLink, ScrollRestoration } from 'react-router-dom';

const Header = () => {
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const announcement = {
    show: true,
  };

  useEffect(() => {
    const controlNavbar = () => {
      if (window.scrollY > lastScrollY) {
        // if scroll down hide the navbar
        setIsVisible(false);
      } else {
        // if scroll up show the navbar
        setIsVisible(true);
      }
      // remember current page location to use in the next move
      setLastScrollY(window.scrollY);
    };

    window.addEventListener('scroll', controlNavbar);

    // Cleanup function
    return () => {
      window.removeEventListener('scroll', controlNavbar);
    };
  }, [lastScrollY]);

  return (
    <>
      {/* Browser's scroll restoration  */}
      <ScrollRestoration />

      {/* Header */}
      <header
        className={`header ${isVisible ? '' : 'header--hidden'}`}
        id="header"
      >
        {announcement.show && (
          <div className="header__announcement">
            <div className="header__announcement__wrapper">
              <p>
                🚀Just in: PillarX Algorithmic Insights! Trade smarter with
                PillarX.{' '}
                <a href="https://go.pillarx.app/LY6ZNTS">
                  Start your FREE 7-day trial
                </a>
              </p>
            </div>
          </div>
        )}

        <div className="container">
          <Link to="/" className="header__logo">
            <img
              src="https://cdn.pillarx.app/pillarXLogo.png"
              alt="pillar-x-logo"
            />
          </Link>

          <nav
            className={
              showMobileMenu
                ? 'header__menu header__menu--show'
                : 'header__menu'
            }
          >
            <ul id="menu" onClick={() => setShowMobileMenu(!showMobileMenu)}>
              <li>
                <NavLink to="/#superpowers">Superpowers</NavLink>
              </li>
              <li>
                <NavLink to="/#about" className="active--no-style">
                  About
                </NavLink>
              </li>
              <li>
                <a href="https://blog.pillarx.app/">Blog</a>
              </li>
              <li>
                <a>Cooperation</a>
                <ul>
                  <li>
                    <NavLink to="/developers">For dApp</NavLink>
                  </li>
                  <li>
                    <NavLink to="/advertising">Advertising</NavLink>
                  </li>
                </ul>
              </li>
            </ul>

            <Link
              to="/login"
              className="header__login cta plausible-event-name=Login+Nav"
            >
              <span>Log in</span>
            </Link>
          </nav>

          <div
            className={
              showMobileMenu
                ? 'header__mobile_menu header__mobile_menu--change'
                : 'header__mobile_menu'
            }
            onClick={() => setShowMobileMenu(!showMobileMenu)}
          >
            <div className="bar1"></div>
            <div className="bar2"></div>
            <div className="bar3"></div>
          </div>
        </div>
      </header>
    </>
  );
};

export { Header };
