/* global Tether */

const {
  extend,
  addClass,
  removeClass,
  hasClass,
  Evented
} = Tether.Utils;

function sortAttach(str) {
  let [first, second] = str.split(' ');
  if (['left', 'right'].indexOf(first) >= 0) {
    [first, second] = [second, first];
  }
  return [first, second].join(' ');
}

function removeFromArray(arr, item) {
  let index;
  let results = [];
  while((index = arr.indexOf(item)) !== -1) {
    results.push(arr.splice(index, 1));
  }
  return results
}

let clickEvents = ['click'];
if ('ontouchstart' in document.documentElement) {
  clickEvents.push('touchstart');
}

const transitionEndEvents = {
  'WebkitTransition' : 'webkitTransitionEnd',
  'MozTransition'    : 'transitionend',
  'OTransition'      : 'otransitionend',
  'transition'       : 'transitionend'
};

let transitionEndEvent = '';
for (let name in transitionEndEvents) {
  if ({}.hasOwnProperty.call(transitionEndEvents, name)) {
    let tempEl = document.createElement('p');
    if (tempEl.style[name] !== 'undefined') {
      transitionEndEvent = transitionEndEvents[name];
    }
  }
}

const MIRROR_ATTACH = {
  left: 'right',
  right: 'left',
  top: 'bottom',
  bottom: 'top',
  middle: 'middle',
  center: 'center'
}

let allDrops = {}

// Drop can be included in external libraries.  Calling createContext gives you a fresh
// copy of drop which won't interact with other copies on the page (beyond calling the document events).

function createContext(options={}) {

  let drop = (...args) => new DropInstance(...args);

  extend(drop, {
    createContext: createContext,
    drops: [],
    defaults: {}
  });

  const defaultOptions = {
    classPrefix: 'drop',
    defaults: {
      position: 'bottom left',
      openOn: 'click',
      constrainToScrollParent: true,
      constrainToWindow: true,
      classes: '',
      remove: false,
      tetherOptions: {}
    }
  };

  extend(drop, defaultOptions, options);
  extend(drop.defaults, defaultOptions.defaults, options.defaults);

  if (typeof allDrops[drop.classPrefix] === 'undefined') {
    allDrops[drop.classPrefix] = [];
  }

  drop.updateBodyClasses = () => {
    // There is only one body, so despite the context concept, we still iterate through all
    // drops which share our classPrefix.

    let anyOpen = false;
    const drops = allDrops[drop.classPrefix];
    const len = drops.length;
    for (let i = 0; i < len; ++i) {
      if (drops[i].isOpened()) {
        anyOpen = true;
        break;
      }
    }

    if (anyOpen) {
      addClass(document.body, `${ drop.classPrefix }-open`);
    } else {
      removeClass(document.body, `${ drop.classPrefix }-open`);
    }

  };

  class DropInstance extends Evented {
    constructor(opts) {
      super()
      this.options = extend({}, drop.defaults, opts);
      this.target = this.options.target;

      if (typeof this.target === 'undefined') {
        throw new Error('Drop Error: You must provide a target.');
      }

      if (this.options.classes && this.options.addTargetClasses !== false) {
        addClass(this.target, this.options.classes);
      }

      drop.drops.push(this);
      allDrops[drop.classPrefix].push(this);

      this._boundEvents = [];
      this.setupElements();
      this.setupEvents();
      this.setupTether();
    }

    _on(element, event, handler) {
      this._boundEvents.push({element, event, handler});
      element.addEventListener(event, handler);
    }

    setupElements() {
      this.drop = document.createElement('div');
      addClass(this.drop, drop.classPrefix);

      if (this.options.classes) {
        addClass(this.drop, this.options.classes);
      }

      this.content = document.createElement('div');
      addClass(this.content, `${ drop.classPrefix }-content`);

      if (typeof this.options.content === 'function') {
        const generateAndSetContent = () => {
          // content function might return a string or an element
          const contentElementOrHTML = this.options.content.call(this, this);

          if (typeof contentElementOrHTML === 'string') {
            this.content.innerHTML = contentElementOrHTML;
          } else if (typeof contentElementOrHTML === 'object') {
            this.content.innerHTML = "";
            this.content.appendChild(contentElementOrHTML);
          } else {
            throw new Error('Drop Error: Content function should return a string or HTMLElement.');
          }

        };

        generateAndSetContent()
        this.on('open', generateAndSetContent.bind(this));
      } else if (typeof this.options.content === 'object') {
        this.content.appendChild(this.options.content);
      } else {
        this.content.innerHTML = this.options.content;
      }

      this.drop.appendChild(this.content);
    }

    setupTether() {
      // Tether expects two attachment points, one in the target element, one in the
      // drop.  We use a single one, and use the order as well, to allow us to put
      // the drop on either side of any of the four corners.  This magic converts between
      // the two:
      let dropAttach = this.options.position.split(' ');
      dropAttach[0] = MIRROR_ATTACH[dropAttach[0]];
      dropAttach = dropAttach.join(' ');

      let constraints = [];
      if (this.options.constrainToScrollParent) {
        constraints.push({
          to: 'scrollParent',
          pin: 'top, bottom',
          attachment: 'together none'
        });
      } else {
        // To get 'out of bounds' classes
        constraints.push({
          to: 'scrollParent'
        });
      }

      if (this.options.constrainToWindow !== false) {
        constraints.push({
          to: 'window',
          attachment: 'together'
        });
      } else {
        // To get 'out of bounds' classes
        constraints.push({
          to: 'window'
        });
      }

      const opts = {
        element: this.drop,
        target: this.target,
        attachment: sortAttach(dropAttach),
        targetAttachment: sortAttach(this.options.position),
        classPrefix: drop.classPrefix,
        offset: '0 0',
        targetOffset: '0 0',
        enabled: false,
        constraints: constraints,
        addTargetClasses: this.options.addTargetClasses
      };

      if (this.options.tetherOptions !== false) {
        this.tether = new Tether(extend({}, opts, this.options.tetherOptions));
      }
    }

    setupEvents() {
      if (!this.options.openOn) {
        return;
      }

      if (this.options.openOn === 'always') {
        setTimeout(this.open.bind(this))
        return;
      }

      const events = this.options.openOn.split(' ');

      if (events.indexOf('click') >= 0) {
        const openHandler = (event) => {
          this.toggle()
          event.preventDefault()
        };

        const closeHandler = (event) => {
          if (!this.isOpened()) {
            return;
          }

          // Clicking inside dropdown
          if (event.target === this.drop || this.drop.contains(event.target)) {
            return;
          }

          // Clicking target
          if (event.target === this.target || this.target.contains(event.target)) {
            return;
          }

          this.close()
        };

        for (let i = 0; i < clickEvents.length; ++i) {
          const clickEvent = clickEvents[i];
          this._on(this.target, clickEvent, openHandler);
          this._on(document, clickEvent, closeHandler);
        }
      }

      if (events.indexOf('hover') >= 0) {
        let onUs = false;

        const over = () => {
          onUs = true;
          this.open();
        };

        let outTimeout = null;
        const out = () => {
          onUs = false

          if (typeof outTimeout !== 'undefined') {
            clearTimeout(outTimeout)
          }

          outTimeout = setTimeout(() => {
            if (!onUs) {
              this.close();
            }
            outTimeout = null;
          }, 50)
        }

        this._on(this.target, 'mouseover', over);
        this._on(this.drop, 'mouseover', over);
        this._on(this.target, 'mouseout', out);
        this._on(this.drop, 'mouseout', out);
      }
    }

    isOpened() {
      if (this.drop) {
        return hasClass(this.drop, `${ drop.classPrefix }-open`);
      }
    }

    toggle() {
      if (this.isOpened()) {
        this.close()
      } else {
        this.open()
      }
    }

    open() {
      if (this.isOpened()) {
        return;
      }

      if (!this.drop.parentNode) {
        document.body.appendChild(this.drop);
      }

      if (typeof this.tether !== 'undefined') {
        this.tether.enable()
      }

      addClass(this.drop, `${ drop.classPrefix }-open`);
      addClass(this.drop, `${ drop.classPrefix }-open-transitionend`);

      setTimeout(() => {
        addClass(this.drop, `${ drop.classPrefix }-after-open`);
      })

      if (typeof this.tether !== 'undefined') {
        this.tether.position();
      }

      this.trigger('open');

      drop.updateBodyClasses();
    }

    close() {
      if (!this.isOpened()) {
        return;
      }

      removeClass(this.drop, `${ drop.classPrefix }-open`);
      removeClass(this.drop, `${ drop.classPrefix }-after-open`);

      const handler = () => {
        if (!hasClass(this.drop, `${ drop.classPrefix }-open`)) {
          removeClass(this.drop, `${ drop.classPrefix }-open-transitionend`);
        }
        this.drop.removeEventListener(transitionEndEvent, handler);
      }

      this.drop.addEventListener(transitionEndEvent, handler);

      this.trigger('close');

      if (typeof this.tether !== 'undefined') {
        this.tether.disable();
      }

      drop.updateBodyClasses();

      if (this.options.remove) {
        this.remove();
      }
    }

    remove() {
      this.close();
      if (typeof this.drop.parentNode !== 'undefined') {
        this.drop.parentNode.removeChild(this.drop);
      }
    }

    position() {
      if (this.isOpened() && typeof this.tether !== 'undefined') {
        this.tether.position();
      }
    }

    destroy() {
      this.remove();

      if (typeof this.tether !== 'undefined') {
        this.tether.destroy();
      }

      for (let i = 0; i < this._boundEvents.lengt; ++i) {
        const {element, event, handler} = this._boundEvents[i];
        element.removeEventListener(event, handler);
      }

      this._boundEvents = [];

      this.tether = null;
      this.drop = null;
      this.content = null;
      this.target = null;

      removeFromArray(allDrops[drop.classPrefix], this);
      removeFromArray(drop.drops, this);
    }

  }

  return drop;
}

const Drop = createContext();

document.addEventListener('DOMContentLoaded', () => {
  Drop.updateBodyClasses();
})

