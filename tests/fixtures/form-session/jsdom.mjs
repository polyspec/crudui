// Import only in jsdom test environments. jsdom has no layout, so it does not
// implement scrolling; the focus rules call scrollIntoView, which browsers provide.
Element.prototype.scrollIntoView = function scrollIntoView() {};
