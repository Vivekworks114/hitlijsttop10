/**
 * Elementor content page interactions: accordion, table of contents.
 */
(function () {
  const ACCORDION_DURATION = 400;

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function slideDown(element, duration) {
    return new Promise((resolve) => {
      if (prefersReducedMotion() || duration === 0) {
        element.style.display = 'block';
        resolve();
        return;
      }

      element.style.display = 'block';
      element.style.overflow = 'hidden';
      element.style.height = '0';
      element.style.transition = `height ${duration}ms ease`;

      requestAnimationFrame(() => {
        element.style.height = `${element.scrollHeight}px`;
      });

      const onEnd = (event) => {
        if (event.propertyName !== 'height') return;
        element.removeEventListener('transitionend', onEnd);
        element.style.height = '';
        element.style.overflow = '';
        element.style.transition = '';
        resolve();
      };

      element.addEventListener('transitionend', onEnd);
      setTimeout(resolve, duration + 50);
    });
  }

  function slideUp(element, duration) {
    return new Promise((resolve) => {
      if (prefersReducedMotion() || duration === 0) {
        element.style.display = 'none';
        resolve();
        return;
      }

      element.style.overflow = 'hidden';
      element.style.height = `${element.scrollHeight}px`;
      element.style.transition = `height ${duration}ms ease`;

      requestAnimationFrame(() => {
        element.style.height = '0';
      });

      const onEnd = (event) => {
        if (event.propertyName !== 'height') return;
        element.removeEventListener('transitionend', onEnd);
        element.style.display = 'none';
        element.style.height = '';
        element.style.overflow = '';
        element.style.transition = '';
        resolve();
      };

      element.addEventListener('transitionend', onEnd);
      setTimeout(resolve, duration + 50);
    });
  }

  function setTabState(title, content, open) {
    title.classList.toggle('elementor-active', open);
    title.setAttribute('aria-expanded', String(open));
    content.setAttribute('aria-hidden', String(!open));
  }

  function initAccordion() {
    document.querySelectorAll('.elementor-widget-accordion').forEach((widget) => {
      if (widget.dataset.hltAccordionInit) return;
      widget.dataset.hltAccordionInit = '1';

      const items = widget.querySelectorAll('.elementor-accordion-item');
      let animating = false;

      items.forEach((item) => {
        const title = item.querySelector('.elementor-tab-title');
        const content = item.querySelector('.elementor-tab-content');
        if (!title || !content) return;

        content.style.display = 'none';
        content.setAttribute('aria-hidden', 'true');
        title.setAttribute('aria-expanded', 'false');

        title.querySelector('.elementor-accordion-title')?.addEventListener('click', (e) => {
          e.preventDefault();
        });

        title.addEventListener('click', async (e) => {
          e.preventDefault();
          if (animating) return;

          const accordion = item.closest('.elementor-accordion');
          const isOpen = title.classList.contains('elementor-active');
          animating = true;

          try {
            if (isOpen) {
              setTabState(title, content, false);
              await slideUp(content, ACCORDION_DURATION);
            } else {
              const openItems = [...(accordion?.querySelectorAll('.elementor-accordion-item') ?? [])].filter(
                (other) => {
                  const otherTitle = other.querySelector('.elementor-tab-title');
                  return otherTitle?.classList.contains('elementor-active');
                }
              );

              await Promise.all(
                openItems.map(async (openItem) => {
                  const openTitle = openItem.querySelector('.elementor-tab-title');
                  const openContent = openItem.querySelector('.elementor-tab-content');
                  if (!openTitle || !openContent) return;
                  setTabState(openTitle, openContent, false);
                  await slideUp(openContent, ACCORDION_DURATION);
                })
              );

              setTabState(title, content, true);
              await slideDown(content, ACCORDION_DURATION);
            }
          } finally {
            animating = false;
          }
        });

        title.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            title.click();
          }
        });
      });
    });
  }

  function slugify(text) {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function parseWidgetSettings(widget) {
    const raw = widget.getAttribute('data-settings');
    if (!raw) return {};
    try {
      return JSON.parse(raw.replace(/&quot;/g, '"'));
    } catch {
      return {};
    }
  }

  function isExcludedHeading(heading) {
    return (
      heading.closest('.elementor-widget-table-of-contents') ||
      heading.closest('.elementor-location-footer') ||
      heading.closest('footer') ||
      heading.closest('.elementor-widget-posts') ||
      heading.closest('.elementor-tab-title')
    );
  }

  function getHeadingsForToc(widget) {
    const settings = parseWidgetSettings(widget);
    const tags = settings.headings_by_tags?.length
      ? settings.headings_by_tags
      : ['h2', 'h3', 'h4', 'h5', 'h6'];
    const selector = tags.join(', ');
    const collected = [];

    const tocColumn = widget.closest('.elementor-column');
    const row = widget.closest('.elementor-container');

    if (row && tocColumn) {
      row.querySelectorAll('.elementor-column').forEach((col) => {
        if (col === tocColumn) return;
        col.querySelectorAll(selector).forEach((heading) => {
          if (!isExcludedHeading(heading)) collected.push(heading);
        });
      });
    }

    if (collected.length) return collected;

    const root =
      document.getElementById('content') ||
      widget.closest('[data-elementor-type="wp-post"]') ||
      widget.closest('[data-elementor-type="wp-page"]') ||
      document.body;

    root.querySelectorAll(selector).forEach((heading) => {
      if (!isExcludedHeading(heading)) collected.push(heading);
    });

    return collected;
  }

  function ensureHeadingId(heading, usedIds) {
    if (heading.id && !usedIds.has(heading.id)) {
      usedIds.add(heading.id);
      return heading.id;
    }

    let base = slugify(heading.textContent || '') || 'section';
    let id = base;
    let counter = 2;

    while (!id || usedIds.has(id) || document.querySelector(`#${CSS.escape(id)}`)) {
      id = `${base}-${counter++}`;
    }

    heading.id = id;
    usedIds.add(id);
    return id;
  }

  function scrollToHeading(heading) {
    const header = document.querySelector('.elementor-location-header');
    const offset = (header ? header.offsetHeight : 72) + 16;
    const top = heading.getBoundingClientRect().top + window.scrollY - offset;

    window.scrollTo({
      top: Math.max(0, top),
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
    history.replaceState(null, '', '#' + heading.id);
  }

  function buildTocList(container, headings, emptyMessage) {
    container.textContent = '';

    if (!headings.length) {
      const empty = document.createElement('div');
      empty.className = 'elementor-toc__empty';
      empty.textContent = emptyMessage;
      container.appendChild(empty);
      return;
    }

    const list = document.createElement('ul');
    list.className = 'elementor-toc__list-wrapper';
    const usedIds = new Set();

    headings.forEach((heading) => {
      const id = ensureHeadingId(heading, usedIds);

      const li = document.createElement('li');
      li.className = 'elementor-toc__list-item';

      const level = parseInt(heading.tagName.charAt(1), 10);
      if (level > 2) {
        li.classList.add(`elementor-toc__list-item--level-${level}`);
      }

      const link = document.createElement('a');
      link.className = 'elementor-toc__list-item-text elementor-toc__list-item-text--level-' + level;
      link.href = '#' + id;
      link.textContent = heading.textContent?.trim() || '';
      link.addEventListener('click', (e) => {
        e.preventDefault();
        scrollToHeading(heading);
      });

      li.appendChild(link);
      list.appendChild(li);
    });

    container.appendChild(list);
  }

  function initTableOfContents() {
    document.querySelectorAll('.elementor-widget-table-of-contents').forEach((widget) => {
      const body = widget.querySelector('.elementor-toc__body');
      const spinner = widget.querySelector('.elementor-toc__spinner-container');
      if (!body || body.dataset.hltInit) return;
      body.dataset.hltInit = '1';

      if (spinner) spinner.remove();

      const settings = parseWidgetSettings(widget);
      const headings = getHeadingsForToc(widget);
      const emptyMessage =
        settings.no_headings_message || 'Er zijn geen kopteksten gevonden op deze pagina.';

      buildTocList(body, headings, emptyMessage);

      const expandBtn = widget.querySelector('.elementor-toc__toggle-button--expand');
      const collapseBtn = widget.querySelector('.elementor-toc__toggle-button--collapse');

      function setExpanded(expanded) {
        widget.classList.toggle('elementor-toc--collapsed', !expanded);
        expandBtn?.setAttribute('aria-expanded', String(expanded));
        collapseBtn?.setAttribute('aria-expanded', String(expanded));
        body.style.display = expanded ? '' : 'none';
      }

      const onExpand = () => setExpanded(true);
      const onCollapse = () => setExpanded(false);

      expandBtn?.addEventListener('click', onExpand);
      collapseBtn?.addEventListener('click', onCollapse);
      expandBtn?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onExpand();
        }
      });
      collapseBtn?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onCollapse();
        }
      });

      if (widget.classList.contains('elementor-toc--minimized-on-tablet')) {
        const mq = window.matchMedia('(max-width: 1024px)');
        const update = () => setExpanded(!mq.matches);
        mq.addEventListener('change', update);
        update();
      } else {
        setExpanded(true);
      }
    });
  }

  function init() {
    initAccordion();
    initTableOfContents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
