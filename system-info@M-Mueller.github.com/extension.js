const Lang      = imports.lang;
const Mainloop  = imports.mainloop;
const GLib      = imports.gi.GLib;
const St        = imports.gi.St;
const Clutter   = imports.gi.Clutter;
const Main      = imports.ui.main;
const PanelMenu	= imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Util      = imports.misc.util;

const Gettext = imports.gettext.domain("gnome-shell-extensions");
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

try {
    const GTop = imports.gi.GTop;
} catch(e) {
    log(e);
}

let systemInfoIndicator;
let settings;

const Cpu = Lang.Class({
    Name: "Cpu",
    Extends: PopupMenu.PopupMenuItem,

    index: 0,

    _parent: 0,
    _gtop_cpu: 0,
    _last_total: 0,
    _last_idle: 0,

    _init: function(cpu_index) {
        this.parent("");
        this.index = cpu_index;

        try {
            this._gtop_cpu = new GTop.glibtop_cpu();
        } catch(e) {
            log(e);
        }

        this.refresh();
    },

    refresh: function() {
        GTop.glibtop_get_cpu(this._gtop_cpu);
        let total = this._gtop_cpu.xcpu_total[this.index] - this._last_total;
        let idle = this._gtop_cpu.xcpu_idle[this.index] - this._last_idle;

        // only update text if changed
        if(total > 0) {
            // display the percentage of the total cpu time that is not idle
            let cpu_percentage = (100.0 - (idle / total)*100).toFixed(1);
            this.label.text = "CPU" + this.index.toString() + ": " + cpu_percentage.toString() + "%";
        }

        this._last_total = this._gtop_cpu.xcpu_total[this.index];
        this._last_idle = this._gtop_cpu.xcpu_idle[this.index];
    }
});

// sets the label.text to e.g. 'Memory: 316.8 MiB of 4.9 GiB (6.3%)'
function set_mem_label_text(label, name, total, used) {
    if(total > 0) {
        let percentage = ((used / total)*100).toFixed(1);
        // convert to nicer display string including unit
        total = GLib.format_size_full(total, GLib.FormatSizeFlags.IEC_UNITS)
        used = GLib.format_size_full(used, GLib.FormatSizeFlags.IEC_UNITS)
        let ratio = used + " of " + total;
        label.text = name + ": " + ratio + " (" + percentage.toString() + "%)";
    } else {
        label.text = name + ": Unavailable";
    }
}

const Mem = Lang.Class({
    Name: "Mem",
    Extends: PopupMenu.PopupMenuItem,

    _parent: 0,
    _gtop_mem: 0,

    _init: function() {
        this.parent("");

        try {
            this._gtop_mem = new GTop.glibtop_mem();
        } catch(e) {
            log(e);
        }

        this.refresh();
    },

    refresh: function() {
        GTop.glibtop_get_mem(this._gtop_mem);
        let total = this._gtop_mem.total;
        let used = this._gtop_mem.user;

        set_mem_label_text(this.label, _("Memory"), total, used);
    }
});

const Swap = Lang.Class({
    Name: "Swap",
    Extends: PopupMenu.PopupMenuItem,

    _parent: 0,
    _gtop_swap: 0,

    _init: function() {
        this.parent("");

        try {
            this._gtop_swap = new GTop.glibtop_swap();
        } catch(e) {
            log(e);
        }

        this.refresh();
    },

    refresh: function() {
        GTop.glibtop_get_swap(this._gtop_swap);
        let total = this._gtop_swap.total;
        let used = this._gtop_swap.used;

        set_mem_label_text(this.label, _("Swap"), total, used);
    }
});

const SystemInfoIndicator = Lang.Class({
    Name: "SystemInfoIndicator",
    Extends: PanelMenu.Button,

    _cpu_label: null,
    _mem_text: null,
    _mem_label: null,

    _last_total: 0,
    _last_idle: 0,

    _cpus: new Array(),
    _mem: 0,
    _swap: 0,
    _gtop_cpu: 0,
    _gtop_mem: 0,

    _timeout: null,
    _settingConnectID: null,

    _init: function() {
        this.parent(0.0, "SystemInfoIndicator");
        let hbox = new St.BoxLayout({ style_class: "panel-status-menu-box",
                                      style: "spacing: 5px;"
        });
        //let icon = new St.Icon({ icon_name: "drive-harddisk-symbolic.svg" });
        let cpu_text = new St.Label({ text: "CPU:",
                                   y_expand: true,
                                   y_align: Clutter.ActorAlign.CENTER });

        this._cpu_label = new St.Label({ text: "0%",
                                   y_expand: true,
                                   y_align: Clutter.ActorAlign.CENTER });

        this._mem_text = new St.Label({ text: "Mem:",
                                  y_expand: true,
                                  y_align: Clutter.ActorAlign.CENTER });

        this._mem_label = new St.Label({ text: "0%",
                                  y_expand: true,
                                  y_align: Clutter.ActorAlign.CENTER });

        //hbox.add_child(icon);
        hbox.add_child(cpu_text);
        hbox.add_child(this._cpu_label);
        hbox.add_child(this._mem_text);
        hbox.add_child(this._mem_label);
        this.actor.add_child(hbox);

        try {
            this._gtop_cpu = new GTop.glibtop_cpu();
            this._gtop_mem = new GTop.glibtop_mem();

            let numcpus = GTop.glibtop_init().ncpu + 1; //somehow 0 means 1 cpu
            for(let i=0; i<numcpus; ++i) {
                this._cpus[i] = new Cpu(i);
                this.menu.addMenuItem(this._cpus[i]);
            }
        } catch(e) {
            log(e);
        }

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._mem = new Mem();
        this.menu.addMenuItem(this._mem);

        this._swap = new Swap();
        this.menu.addMenuItem(this._swap);

	    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        let settingsItem = new PopupMenu.PopupMenuItem(_("Settings"));
        settingsItem.connect("activate", Lang.bind(this, this.show_settings));
        this.menu.addMenuItem(settingsItem);

        // refresh items when menu is opened
        this.menu.connect("open-state-changed", Lang.bind(this, this.refresh));

        // update refresh rate when settings change
        this._settingConnectID = settings.connect("changed", Lang.bind(this, this.load_settings));

        this.load_settings();
        this.refresh();
    },

    destroy: function() {
        Mainloop.source_remove(this._timeout);
        this._timeout = null;

        if(_this._settingConnectID) {
            settings.disconnect(this._settingConnectID);
            this._settingConnectID = null;
        }
    },

    refresh: function() {
        try {
            GTop.glibtop_get_cpu(this._gtop_cpu)
            let total = this._gtop_cpu.total - this._last_total;
            let idle = this._gtop_cpu.idle - this._last_idle;

            // only update text if changed
            if(total > 0)
            {
                // display the percentage of the total cpu time that is not idle
                let cpu_percentage = 100 - Math.round((idle / total)*100);
                this._cpu_label.text = cpu_percentage.toString() + "%";
            }

            this._last_total = this._gtop_cpu.total;
            this._last_idle = this._gtop_cpu.idle;

            if(this._mem_text.visible)
            {
                GTop.glibtop_get_mem(this._gtop_mem);
                let total_mem = this._gtop_mem.total;
                let used_mem = this._gtop_mem.user;

                let mem_percentage = Math.round((used_mem / total_mem)*100);
                this._mem_label.text = mem_percentage.toString() + "%";
            }
        } catch(e) {
            log(e);
        }

        // only update menu items if the menu is open
        if(this.menu.isOpen) {
            for(let i=0; i<this._cpus.length; ++i) {
                this._cpus[i].refresh();
            }
            if(this._mem)
                this._mem.refresh();
            if(this._swap)
                this._swap.refresh();
        }
    },

    show_settings: function () {
        Util.spawn([
            "gnome-shell-extension-prefs",
            Me.uuid
        ]);
    },

    load_settings: function() {
        if(this._timeout) {
            Mainloop.source_remove(this._timeout);
        }

        // call refresh in fixed intervals
        let refresh_rate = settings.get_int("refresh-rate");
        if(isNaN(refresh_rate)) {
            log("Invalid refresh-rate");
            refresh_rate = 2000;
        }
        refresh_rate = Math.max(500, refresh_rate);
        this._timeout = Mainloop.timeout_add(refresh_rate, Lang.bind(this, function() {
            this.refresh();
            return true; // restart timeout
        }));

        let show_memory = settings.get_boolean("show-memory");
        this._mem_label.visible = show_memory;
        this._mem_text.visible = show_memory;

        this.refresh();
    },
});

function init() {
    settings = Convenience.getSettings();
}

function enable() {
    systemInfoIndicator = new SystemInfoIndicator();
    Main.panel.addToStatusArea("SystemInfoIndicator", systemInfoIndicator, 1, "right");
}

function disable() {
    systemInfoIndicator.destroy();
}
