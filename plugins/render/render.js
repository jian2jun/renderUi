define(["jquery", "widget"], function ($) {


////----


var slice = Array.prototype.slice;

var selectorReg = /^([\w-]+)(?:#([\w-]+))?(?:\.([\.\w-]+))?$/;

var eventReg = /^([\w:-]*)\s*(.*)$/;


////----

var Sel = {

    parser: /(?:(^|#|\.)([^#\.\[\]]+))|(\[(.+?)(?:\s*=\s*("|'|)((?:\\["'\]]|.)*?)\5)?\])/g,

    cache: {},

    compile: function(selector) {
        var match, widget, tag = "", classes = [], data = {};

        if(selector && (match = this.cache[selector])){
            return match;
        }

        while (match = this.parser.exec(selector)){
            var type = match[1], value = match[2];
            if (type === "" && value !== "") {
                tag = value.split(":");
                if(tag[1]){
                    widget = tag[0];
                    tag = tag[1];
                }
                else if(tag[0].match(/^([A-Z]).+/)){
                    widget = tag[0];
                    tag = $.widgets[widget] && $.widgets[widget]["prototype"]["defaultTag"] || "div";
                }
                else{
                    tag = tag[0];
                }
            }
            else if (type === "#") data.id = value;
            else if (type === ".") classes.push(value);
            else if (match[3][0] === "[") {
                var attrValue = match[6];
                if (attrValue) attrValue = attrValue.replace(/\\(["'])/g, "$1").replace(/\\\\/g, "\\");
                if (match[4] === "class") classes.push(attrValue);
                else data[match[4]] = attrValue === "" ? attrValue : attrValue || true;
            }
        }

        if (classes.length > 0) data.class = classes.join(" ");
        return this.cache[selector] = {widget: widget, tag: tag, data: data}
    }
};


////----


var Raw = function (data, render, parent, node) {

    var sel, added;

    this.render = render;
    this.parent = parent;
    this.node = node;
    this.selector = data[0];

    sel = Sel.compile(this.selector);
    this.tag = sel.tag;
    this.widget = sel.widget;

    added = this.getAdded(data.slice(1));
    added.data = $.widget.extend({}, this.transClassStyle(sel.data), this.transClassStyle(added.data));

    if(this.widget){
        if(!$.widgets[this.widget]){
            $.error("Widget error: " + this.selector);
        }
        return this.setWidget(this.widget, added);
    }

    this.setData(added.data);
    this.setChildren(added.children);
    this.text = added.text || "";

    //svg

    if(/^svg/.test(this.selector)) {
        this.addNS(this.data, this.children);
    }
};

Raw.prototype = {

    constructor: Raw,

    transClassStyle: function(data){
        if(!data){
            return;
        }

        if(typeof data.class === "string"){
            data.class = data.class.split(/\s+/);
            data.class = this.setClass(data.class);
        }

        if(typeof data.style === "string"){
            data.style = data.style.split(/;\s*/);
            data.style = this.setStyle(data.style);
        }

        return data;
    },

    setClass: function (value) {
        var classes = {};
        $.each(value, function(i, v){
            classes[v] = {
                init: "add"
            };
        });
        return classes;
    },

    setStyle: function(value){
        var style = {};
        $.each(value, function(i, v){
            if(v){
                v = v.split("=");
                style[v[0]] = v[1];
            }
        });
        return style;
    },

    getAdded: function(data){
        var  result = {}, i = 0, v, children = [];
        if($.isPlainObject(data[0])){
            result.data = data[0];
            i = 1;
        }
        for( ; i < data.length; i++){
            v = data[i];
            if($.isArray(v)){
                this.getArrayChild(v, children);
            }
            else{
                if(v == null || typeof v === "boolean"){}
                else{
                    children.push(String(v));
                }
            }
        }
        if(children.length === 1 && typeof children[0] === "string"){
            result.text = children[0];
        }
        else if(children.length > 0){
            result.children = children;
        }
        return result;
    },

    getArrayChild: function(child, children){
        var that = this;
        if($.isArray(child[0])){
            $.each(child, function(i, c){
                that.getArrayChild(c, children);
            });
        }
        else if(typeof child[0] === "string"){
            children.push(child);
        }
    },

    setWidget: function(name, added){

        var that = this;
        var toString = Object.prototype.toString;
        var slots = {
            default: {}
        };

        if(added.data){
            $.each(added.data, function (key, value) {
                var args = [];
                if(/^on/.test(key)){
                    if($.isArray(value)){
                        args = slice.call(value, 1);
                        value = value[0];
                    }
                    if($.isFunction(value)){
                        added.data[key] = function () {
                            return value.apply(that.render.widget, args.concat(slice.call(arguments, 0)));
                        };
                    }
                }
            });
        }

        if(added.children){
            $.each(added.children, function (i, child) {
                var match, added;
                if($.isArray(child) && (match = child[0].match(/^slot#(\w+)$/))){
                    added = that.getAdded(child.slice(1));
                    slots[match[1]] = added;
                }
                else{
                    slots.default.children = slots.default.children || [];
                    slots.default.children.push(child);
                }
            });
        }
        else if(added.text){
            slots.default.text = added.text;
        }

        $.each(slots, function (key, slot) {
            $.each(slot.children, function (i, child) {
                var data = child[1];
                if(toString.call(data) === "[object Object]"){
                    $.each(data, function (k, v) {
                        if(/^on(\w+)$/.test(k)){
                            data[k] = function () {
                                v.apply(that.render.widget, arguments);
                            };
                        }
                    });
                }
            });
        });

        this.children = [];
        this.text = "";
        this.data = {
            hooks: {
                create: function () {
                    return (function (raw) {
                        $(raw.node)[name](added.data || {}, {slots: slots});
                    }).apply(that.render.widget, slice.call(arguments, 0));
                }
            }
        };
    },

    setData: function(value){

        var that = this;
        var data = this.data = {};
        var hooks = {}, events = {}, match;

        $.each(value, function(k, v){
            if(k === "key"){
                that.key = v;
            }
            else if(k === "style"){
                data.style = v;
            }
            else if(k === "class"){
                data.class = v;
            }
            else if(match = k.match(/^on(\w+)$/)){
                if(
                    $.inArray(match[1], ["create", "update", "destroy"]) > -1){
                    hooks[match[1]] = v;
                }
                else{
                    events[match[1]] = v;
                }
            }
            else{
                data.attrs = data.attrs || {};
                data.attrs[k] = typeof v === "object" ? JSON.stringify(v) : v;
            }
        });

        this.setHooksEvents(hooks, "hooks");
        this.setHooksEvents(events, "events");
    },

    setHooksEvents: function(value, key){

        var that = this;
        var args = [];
        var key = this.data[key] = {};

        $.each(value, function (k, v) {

            if($.isArray(v)){
                args = slice.call(v, 1);
                v = v[0];
            }

            if($.isFunction(v)){
                key[k] = function () {
                    return v.apply(that.render.widget, args.concat(slice.call(arguments, 0)));
                };
            }
            else{
                return $.error("Hook/Event error: " + value);
            }
        });
    },

    setChildren: function(value){
        var that = this;
        var child;

        this.children = [];
        if(!value){
            return;
        }

        $.each(value, function (i, item) {
            if(item == null || typeof item === "boolean"){
                return;
            }
            if(typeof item === "string"){
                item = ["span", item];
            }
            child = new Raw(item, that.render, that);
            that.children.push(child);
        });
    },

    addNS: function(data, children){
        data.ns = "http://www.w3.org/2000/svg";

        $.each(children, function (i, child){
            child.addNS(child.data, child.children);
        });
    }
};


////----


var Diff = function(){};

Diff.prototype = {

    constructor: Diff,

    getNodeData: function(node){
        var data = {};
        $.each(node.attributes, function (i, item) {
            data[item.name] = item.value
        });
        return data;
    },

    createRawByNode: function(node, raw){
        return new Raw([node.tagName.toLowerCase(), this.getNodeData(node)], (raw ? raw.render : $(node).data("_render_")), undefined, $(node).empty()[0]);
    },

    sameRaw: function(oldRaw, raw){
        return oldRaw.key === raw.key && oldRaw.selector === raw.selector;
    },

    updateBase: function(oldRaw, raw, prop, callbacks){
        var oldProp, key;
        var newProp = raw.data[prop] || {};
        var node = raw.node;

        if(oldRaw && (oldProp = oldRaw.data[prop] || {})){
            for(key in oldProp){
                if(newProp[key] === undefined){
                    callbacks.remove.call(this, node, key);
                }
            }
        }

        if(callbacks.hook){
            callbacks.hook.call(this, node, oldProp, newProp, callbacks);
        }
        else{
            if(oldProp){
                for(key in newProp){
                    if(oldProp[key] !== newProp[key]){
                        callbacks.add.call(this, node, key, newProp[key]);
                    }
                }
            }
            else{
                for(key in newProp){
                    callbacks.add.call(this, node, key, newProp[key]);
                }
            }
        }
    },

    isFormNode: function (node){
        return $.inArray(node.tagName.toLowerCase(), ["input", "select", "textarea"]) > -1;
    },

    updateAttrs: function(oldRaw, raw){

        this.updateBase(oldRaw, raw, "attrs", {

            add: function (node, key, value) {
                if(key === "value" && this.isFormNode(node)){
                    $(node).val(value);
                }else{
                    $(node).attr(key, value);
                }
            },

            remove: function (node, key) {
                if(key === "value" && this.isFormNode(node)){
                    $(node).val("");
                }else{
                    $(node).removeAttr(key);
                }
            }
        });
    },

    updateStyle: function(oldRaw, raw) {

        this.updateBase(oldRaw, raw, "style", {

            add: function(node, key, value){

                if($.isFunction(value)){
                    console.log(key);
                    value = value.call(raw.render.widget, raw, oldRaw);
                }

                $(node).css(key, value);
            },

            remove: function(node, key){
                $(node).css(key, "");
            }

        });
    },

    nextFrame: function(callback, time){

        var that = this;
        var timeout;

        if(time){
            setTimeout(function(){
                callback.call(that);
            }, time);
        }
        else{
            timeout = window.requestAnimationFrame || window.setTimeout;
            timeout(function(){
                timeout(function () {
                    callback.call(that);
                });
            });
        }
    },

    updateClasses: function(oldRaw, raw) {

        this.updateBase(oldRaw, raw, "class", {

            hook: function(node, oldClasses, classes, callbacks){

                var that = this;
                var element = $(node);

                $.each(classes, function(key, value){

                    var delay, time, d, t;

                    delay = value.delay;

                    if($.isArray(value.delay)){
                        time = value.delay[1];
                        delay = value.delay[0];
                        if($.isArray(time)){
                            d = time[0];
                            t = time[1];
                            time = undefined;
                        }
                        if($.isArray(delay)){
                            time = delay[1];
                            delay = delay[0];
                        }
                    }

                    if(element.hasClass(key)){
                        if(value.init === "add"){
                            if(delay === "remove"){
                                that.nextFrame(function(){
                                    callbacks.remove.call(that, node, key);
                                    if(d === "add"){
                                        that.nextFrame(function(){
                                            callbacks.add.call(that, node, key);
                                        }, t);
                                    }
                                }, time);
                            }
                        }else{
                            callbacks.remove.call(that, node, key);
                            if(delay === "add"){
                                that.nextFrame(function(){
                                    callbacks.add.call(that, node, key);
                                    if(d === "remove"){
                                        that.nextFrame(function(){
                                            callbacks.remove.call(that, node, key);
                                        }, t);
                                    }
                                }, time);
                            }
                        }
                    }else{
                        if(value.init === "add"){
                            callbacks.add.call(that, node, key);
                            if(delay === "remove"){
                                that.nextFrame(function(){
                                    callbacks.remove.call(that, node, key);
                                    if(d === "add"){
                                        that.nextFrame(function(){
                                            callbacks.add.call(that, node, key);
                                        }, t);
                                    }
                                }, time);
                            }
                        }else{
                            if(delay === "add"){
                                that.nextFrame(function(){
                                    callbacks.add.call(that, node, key);
                                    if(d === "remove"){
                                        that.nextFrame(function(){
                                            callbacks.remove.call(that, node, key);
                                        }, t);
                                    }
                                }, time);
                            }
                        }
                    }
                });
            },

            add: function(node, key){
                $(node).addClass(key);
            },

            remove: function(node, key){
                $(node).removeClass(key);
            }
        });
    },

    updateEvents: function(oldRaw, raw){

        this.updateBase(oldRaw, raw, "events", {

            hook: function(node, oldEvents, events, callbacks){

                var that = this;

                $.each(events, function(key, value){

                    if(!oldEvents || !oldEvents[key]){
                        callbacks.add.call(that, node, key, value);
                    }
                    else{
                        callbacks.remove.call(that, node, key);
                        callbacks.add.call(that, node, key, value);
                    }
                });
            },

            add: function(node, key, value){
                var match = key.match(eventReg);
                var eventName = match[1] + raw.render.eventNamespace;
                var selector = match[2];
                var fn = function (e) {
                    value(e, raw, oldRaw);
                };

                if(selector){
                    $(node).on( eventName, selector, fn);
                }
                else{
                    $(node).on( eventName, fn);
                }
            },

            remove: function(node, key){
                var match = key.match(eventReg);
                $(node).off(match[1] + raw.render.eventNamespace);
            }
        });
    },

    destroyEvents: function(raw) {
        if(raw.data.events){
            $(raw.node).off(raw.render.eventNamespace);
        }
    },

    destroyClasses(raw, rm) {

        this.updateBase(undefined, raw, "class", {

            hook: function(node, oldClasses, classes, callbacks){

                var that = this;
                var dfds = [];

                if($.isEmptyObject(classes)){
                    return rm && rm();
                }

                $.each(classes, function(key, value){

                    var time;

                    if($.isArray(value.destroy)){
                        time = value.destroy[1];
                        value.destroy = value.destroy[0];
                    }

                    if(value.destroy === "add"){
                        callbacks.add.call(that, node, key);
                    }
                    else if(value.destroy === "remove"){
                        if(time){
                            dfds.push($.Deferred(function (dfd) {
                                that.nextFrame(function(){
                                    callbacks.remove.call(that, node, key);
                                    dfd.resolve();
                                }, time);
                            }));
                        }
                        else{
                            callbacks.remove.call(that, node, key);
                        }
                    }
                });

                $.when.apply($, dfds).done(function () {
                    rm && rm();
                });
            },

            add: function(node, key){
                $(node).addClass(key);
            },

            remove: function(node, key){
                $(node).removeClass(key);
            }
        });
    },

    setData: function(raw){
        this.updateAttrs(undefined, raw);
        this.updateStyle(undefined, raw);
        this.updateClasses(undefined, raw);
        this.updateEvents(undefined, raw);
    },

    createNodeByRaw: function(raw, createQueue, root) {

        var that = this;
        var data = raw.data;
        var tag, element, children;

        tag = raw.tag;

        if(tag === "!"){
            raw.node = document.createComment(raw.text);
        }
        else{
            raw.node = data.ns ? document.createElementNS(data.ns, tag) : document.createElement(tag);
            element = $(raw.node);

            if(!root){
                element.data("_raw_", raw);
            }

            this.setData(raw);

            children = raw.children;
            if(children.length){
                $.each(children, function(i, child){
                    element.append(that.createNodeByRaw(child, createQueue));
                });
            }
            else{
                element.html(raw.text);
            }

            if(data.hooks && data.hooks.create){
                createQueue.push(raw);
            }
        }

        return raw.node;
    },

    destroyChildren(children) {
        var that = this;
        $.each(children, function(i, child){
            var hooks = child.data.hooks;

            that.destroyClasses(child);
            that.destroyEvents(child);

            if(hooks && hooks.destroy){
                hooks.destroy(child);
            }
            that._hook("destroy", child);

            that.destroyChildren(child.children);
        });
    },

    removeRaws(raws, startIdx, endIdx) {

        var raw, rm, hooks;

        for (; startIdx <= endIdx; ++startIdx) {

            raw = raws[startIdx];

            if(raw){

                this.destroyChildren(raw.children);

                rm = (function(raw, count){
                    return function(){
                        if(--count < 1){
                            $(raw.node).remove();
                        }
                    };
                })(raw, 3);

                this.destroyClasses(raw, rm);
                this.destroyEvents(raw);

                if((hooks = raw.data.hooks) && hooks.destroy){
                    hooks.destroy(raw, rm);
                }else{
                    rm();
                }

                this._hook("destroy", raw, rm);
            }
        }
    },

    createKeyToIdx: function(raws, startIdx, endIdx) {

        var i, map = {}, raw, key;

        for (i = startIdx; i <= endIdx; ++i) {
            raw = raws[i];
            if(raw && (key = raw.key)){
                map[key] = i;
            }
        }

        return map;
    },

    addRaws: function(parent, afterNode, raws, startIdx, endIdx, createQueue) {

        var raw;

        for (; startIdx <= endIdx; ++startIdx) {
            raw = raws[startIdx];
            if (raw) {
                this.createNodeByRaw(raw, createQueue);
                afterNode ? $(raw.node).insertBefore(afterNode) : $(raw.node).appendTo(parent);
            }
        }
    },

    updateChildren(parent, oldC, newC, createQueue) {

        var oldStartIdx = 0, newStartIdx = 0;
        var oldEndIdx = oldC.length - 1;
        var oldStartRaw = oldC[0];
        var oldEndRaw = oldC[oldEndIdx];
        var newEndIdx = newC.length - 1;
        var newStartRaw = newC[0];
        var newEndRaw = newC[newEndIdx];
        var oldKeyToIdx;
        var oldIdx;
        var rawToMove;
        var afterNode;

        while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
            if (oldStartRaw == null) {
                oldStartRaw = oldC[++oldStartIdx];
            }
            else if (oldEndRaw == null) {
                oldEndRaw = oldC[--oldEndIdx];
            }
            else if (newStartRaw == null) {
                newStartRaw = newC[++newStartIdx];
            }
            else if (newEndRaw == null) {
                newEndRaw = newC[--newEndIdx];
            }
            else if (this.sameRaw(oldStartRaw, newStartRaw)) {
                this.patchRaw(oldStartRaw, newStartRaw, createQueue);
                oldStartRaw = oldC[++oldStartIdx];
                newStartRaw = newC[++newStartIdx];
            }
            else if (this.sameRaw(oldEndRaw, newEndRaw)) {
                this.patchRaw(oldEndRaw, newEndRaw, createQueue);
                oldEndRaw = oldC[--oldEndIdx];
                newEndRaw = newC[--newEndIdx];
            }
            else if (this.sameRaw(oldStartRaw, newEndRaw)) {
                this.patchRaw(oldStartRaw, newEndRaw, createQueue);
                $(oldStartRaw.node).insertAfter(oldEndRaw.node);
                oldStartRaw = oldC[++oldStartIdx];
                newEndRaw = newC[--newEndIdx];
            }
            else if (this.sameRaw(oldEndRaw, newStartRaw)) {
                this.patchRaw(oldEndRaw, newStartRaw, createQueue);
                $(oldEndRaw.node).insertBefore(oldStartRaw.node);
                oldEndRaw = oldC[--oldEndIdx];
                newStartRaw = newC[++newStartIdx];
            }
            else {
                oldKeyToIdx = oldKeyToIdx || this.createKeyToIdx(oldC, oldStartIdx, oldEndIdx);
                if(newStartRaw.key
                    && (oldIdx = oldKeyToIdx[newStartRaw.key])
                    && (rawToMove = oldC[oldIdx])
                    && (rawToMove.selector === newStartRaw.selector)
                ){
                    this.patchRaw(rawToMove, newStartRaw, createQueue);
                    oldC[oldIdx] = null;
                    $(rawToMove.node).insertBefore(oldStartRaw.node);
                }else{
                    $(this.createNodeByRaw(newStartRaw, createQueue)).insertBefore(oldStartRaw.node);
                }
                newStartRaw = newC[++newStartIdx];
            }
        }
        if (oldStartIdx <= oldEndIdx || newStartIdx <= newEndIdx) {
            if (oldStartIdx > oldEndIdx) {
                afterNode = newC[newEndIdx + 1] == null ? null : newC[newEndIdx + 1].node;
                this.addRaws(parent, afterNode, newC, newStartIdx, newEndIdx, createQueue);
            }
            else {
                this.removeRaws(oldC, oldStartIdx, oldEndIdx);
            }
        }
    },

    _hook: function(hook, raw, oldRaw){
        var hooks = $(raw.node).data("_hook_");
        var fn;

        if(hooks){
            fn = hooks[hook];
        }

        if(fn){
            fn(raw, oldRaw);
            if(!fn.keep){
                delete hooks[hook];
            }
        }
        else if($.isFunction(oldRaw)){
            oldRaw();
        }
    },

    updateData: function(oldRaw, raw){
        this.updateAttrs(oldRaw, raw);
        this.updateStyle(oldRaw, raw);
        this.updateClasses(oldRaw, raw);
        this.updateEvents(oldRaw, raw);
    },

    patchRaw: function(oldRaw, raw, createQueue, root) {

        var data = raw.data;
        var node, element, oldChildren, children;

        node = raw.node = oldRaw.node;
        element = $(node);
        if(!root){
            element.data("_raw_", raw);
        }

        if(data.hooks && data.hooks.update){
            data.hooks.update(raw, oldRaw);
        }
        this._hook("update", raw, oldRaw);

        if(data.remove){
            return this.removeRaws([raw], 0, 0);
        }

        this.updateData(oldRaw, raw);

        oldChildren = oldRaw.children;
        children = raw.children;

        if(oldChildren.length && children.length){
            this.updateChildren(node, oldChildren, children, createQueue);
        }
        else if(children.length){
            if(oldRaw.text){
                element.empty();
            }
            this.addRaws(node, null, children, 0, children.length - 1, createQueue);
        }
        else if(oldChildren.length){
            this.removeRaws(oldChildren, 0, oldChildren.length - 1);
            element.html(raw.text);
        }
        else{
            if(oldRaw.text !== raw.text){
                element.html(raw.text);
            }
        }
    },

    patch: function(oldRaw, raw) {
        var that = this;

        if(!oldRaw && !raw){
            return;
        }

        if(!oldRaw){
            raw.createQueue = [];
            this.createNodeByRaw(raw, raw.createQueue, true);
        }
        else if(!raw){
            if(oldRaw.constructor !== Raw){
                oldRaw = this.createRawByNode(oldRaw);
            }
            this.removeRaws([oldRaw], 0, 0);
        }
        else{
            if(oldRaw.constructor !== Raw){
                oldRaw = this.createRawByNode(oldRaw, raw);
            }
            raw.createQueue = [];
            this.patchRaw(oldRaw, raw, raw.createQueue, true);

            $.each(raw.createQueue, function(i, raw){
                raw.data.hooks.create(raw);
            });
        }

        return raw;
    }
};


////----


var renderUuid = 0;

var Render = function (node, options) {

    this.node = node;
    this.uuid = renderUuid++;
    this.eventNamespace = "._render_" + this.uuid;

    $.data(this.node, "_render_", this);

    this.render = options.render;
    this.options = $.widget.extend({}, options.options);
    this.widget = options.widget || this;

    //--

    this.init();
};

Render.prototype = {

    constructor: Render,

    diff: new Diff(),

    createHooks: [],

    updateHooks: [],

    destroyHooks: [],

    init: function () {
        var that = this;
        var hook;

        $(this.node).on("remove" + this.eventNamespace, function (e) {
            if ( e.target === that.node ) {
                that.destroy();
            }
        });

        this.createRaw();
        this.mergeRaw();
        this.patch();

        if(
            this.raw &&
            (hook = this.raw.data.hooks) &&
            (hook = hook.create)
        ){
            hook(this.raw);
        }

        //--

        $.each(this.createHooks, function (key, hook) {
            hook.call(that);
        });
    },

    createRaw: function () {

        var data;

        if($.isArray(this.render)){
            data = this.render;
        }
        else if($.isFunction(this.render)){
            data = this.render.call(this, this.options, this.widget);
            if(!$.isArray(data)){
                data = [];
            }
        }
        else{
            data = [];
        }

        if($.isArray(data[0])){
            data = ["", data];
        }

        this.raw = data.length ? new Raw(data, this) : null;
    },

    mergeRaw: function(update){

        var element = $(this.node);
        var raw;

        if(this.raw){

            if(!this.raw.widget){
                this.raw.tag = element.prop("tagName").toLowerCase();
                this.raw.selector = this.raw.tag + this.raw.selector;
            }

            raw = element.data("_raw_") || this.diff.createRawByNode(this.node);
            if(raw.data.style){
                this.raw.data.style = $.widget.extend({}, raw.data.style, this.raw.data.style);
            }
            if(raw.data.class){
                this.raw.data.class = $.widget.extend({}, raw.data.class, this.raw.data.class);
            }
            if(raw.data.attrs){
                this.raw.data.attrs = $.widget.extend({}, raw.data.attrs, this.raw.data.attrs);
            }
        }
    },

    patch: function () {
        this.diff.patch(this.oldRaw || this.node, this.raw);
        this.oldRaw = this.raw;
    },

    update: function (value) {
        var that = this;
        var delay;

        if($.isFunction(value)){
            value.call(that, this.options);
        }
        else{
            $.widget.extend(this.options, value);
        }

        if(!this.updating){
            this.updating = true;
            delay = window.requestAnimationFrame || window.setTimeout;
            delay(function () {
                that.updating = false;
                that.createRaw();
                that.mergeRaw();
                that.patch();

                //--

                $.each(that.updateHooks, function (key, hook) {
                    hook.call(that);
                });
            })
        }
    },

    destroy: function(){
        var that = this;

        $.removeData(this.node, "_render_");
        $.each(this.destroyHooks, function (key, hook) {
            hook.call(that);
        });
    },

    hook: function (nodes, hook, fn, keep) {
        $(nodes).each(function (i, node) {
            var element = $(node);
            var hooks = element.data("_hook_") || {};

            hooks[hook] = function (raw, oldRaw) {
                fn.call(raw.render.widget, raw, oldRaw, i, node);
            };
            hooks[hook]["keep"] = keep;
            element.data("_hook_", hooks);
        });
    },

    option: function(key){
        if(key){
            return eval("this.options." + key);
        }
        return this.options;
    },

};

Render.hook = function (key, hook) {
    switch (key) {
        case "create":
            Render.prototype.createHooks.push(hook);
            break;
        case "update":
            Render.prototype.updateHooks.push(hook);
            break;
        case "destroy":
            Render.prototype.destroyHooks.push(hook);
            break;
    }
};

$.Render = Render;


////----


$.fn.extend({

    render: function(options, render, widget){

        var returnValue = this;
        var value;

        this.each(function (i, node) {
            if(value = $.render(node, options, render, widget)){
                returnValue = value;
                return false;
            }
        });

        return returnValue;
    },

    raw: function(name){
        if(this.length){
            return $.raw(this[0], name) || null;
        }
        return null;
    },

    serializeJson: function(){
        var serializeObj={};
        var temp = this.serializeArray();
        var not_checked_object = $("input[type=checkbox]:not(:checked)", this);
        $.each(not_checked_object, function () {
            if (!temp.hasOwnProperty(this.name)){
                temp.push({name: this.name, value: ""});
            }
        });
        $(temp).each(function(){
            if(serializeObj[this.name]){
                if($.isArray(serializeObj[this.name])){
                    serializeObj[this.name].push(this.value);
                }else{
                    serializeObj[this.name] = [serializeObj[this.name], this.value];
                }
            }else{
                serializeObj[this.name] = this.value;
            }
        });
        return serializeObj;
    }

});

$.extend({

    render: function(node, options, render, widget){

        var instance;
        var element = $(node);

        if(typeof options === "string"){

            instance = element.data("_render_") || (element.data("_raw_") || {})["render"];

            if(!instance){
                return $.error("Uninitialized method error: " + options);
            }

            if(options === "instance"){
                return instance;
            }

            if (!$.isFunction(instance[options]) || options.charAt(0) === "_"){
                return $.error("Method error: " + options);
            }

            return instance[options].apply(instance, [].slice.call(arguments, 2));
        }

        if(element.data("_render_")){
            element.render("destroy");
        }

        if($.isPlainObject(options)){
            new Render(node, options);
        }
        else{

            if($.isFunction(options)){
                widget = render;
                render = options;
                options = undefined;
            }

            new Render(node, {
                options: options,
                render: render,
                widget: widget
            });
        }
    },

    raw: function(node, name){
        var element = $(node);
        var raw = element.data("_raw_") || (element.data("_render_") || {})["raw"] || null;
        return name ? (raw || {})[name] || null : raw;
    }

});





////----


if($.Widget){

    $.extend($.Widget.prototype, {

        _render: function (element, options, render) {

            if (!element.jquery) {
                return this._render.apply(this, [this.element].concat(slice.call(arguments)));
            }

            if (typeof options === "string") {
                return element.render.apply(element, slice.call(arguments, 1));
            }

            if($.isFunction(options)){
                render = options;
                options = undefined;
            }

            element.render({
                render: render,
                options: options || this.options,
                widget: this
            });
        },

        _slot: function(name){
            var slot;

            name = name.split(":");
            slot = this.options.slots[name[0]];

            if(!slot){
                return name[1] === "data" ? {} : undefined;
            }
            else{
                return name[1] === "data" ? (slot.data || {}) : (slot.children || slot.text);
            }
        }

    });

}


////----扩展$(selector).ready();


if(!$.fn.selector){

    $.fn.init = (function (orig) {

        return function (selector, context, root) {
            var inst = orig.call(this, selector, context, root);
            inst.selector = selector;
            return inst;
        }

    })($.fn.init);

    $.fn.init.prototype = $.fn;
}

$.fn.ready = (function (orig) {

    return function (fn) {
        var that = this;

        if(this[0] === document){
            return orig.call(this, fn);
        }
        else{
            if(this.length){
                fn.call(this[0], $);
            }
            else{
                $.Deferred(function (dfd) {
                    var element;
                    var time = 3000;
                    var interval = setInterval(function () {
                        element = $(that.selector);
                        if(element.length){
                            clearInterval(interval);
                            dfd.resolveWith(element[0], $);
                        }
                        else{
                            time -= 50;
                            if(time <= 0){
                                clearInterval(interval);
                            }
                        }
                    }, 50);
                }).done(fn);
            }
            return this;
        }
    }

})($.fn.ready);


});