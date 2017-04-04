const Lang      = imports.lang;
const Mainloop  = imports.mainloop;
const GLib      = imports.gi.GLib;
const St        = imports.gi.St;
const Clutter   = imports.gi.Clutter;
const Shell		= imports.gi.Shell;
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

// returns a string repesentation of used bytes e.g. '316.8 MiB of 4.9 GiB (6.3%)'
function get_byte_usage_string(total, used) {
    if(total > 0) {
        let percentage = ((used / total)*100).toFixed(1);
        // convert to nicer display string including unit
        total = GLib.format_size_full(total, GLib.FormatSizeFlags.IEC_UNITS)
        used = GLib.format_size_full(used, GLib.FormatSizeFlags.IEC_UNITS)
        let ratio = used + " of " + total;
        return ratio + " (" + percentage.toString() + "%)";
    } else {
        return "Unavailable";
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

        this.label.text = _("Memory") + ": " + get_byte_usage_string(total, used);
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

        this.label.text = _("Swap") + ": " + get_byte_usage_string(total, used);
    }
});

const Mount = Lang.Class({
    Name: "Mount",
    Extends: PopupMenu.PopupMenuItem,

    _parent: 0,
	_mount_point: 0,
    _gtop_fsusage: 0,

    _init: function(mount_point) {
        this.parent("");

		this._mount_point = mount_point;
        try {
            this._gtop_fsusage = new GTop.glibtop_fsusage();
        } catch(e) {
            log(e);
        }

        this.refresh();
    },

    refresh: function() {
        GTop.glibtop_get_fsusage(this._gtop_fsusage, this._mount_point);
        let total = this._gtop_fsusage.blocks * this._gtop_fsusage.block_size;
        let used = this._gtop_fsusage.bfree * this._gtop_fsusage.block_size;

        this.label.text = this._mount_point + "\n" + get_byte_usage_string(total, used);
    }
});

function interesting_mountpoint(mount){
	// from https://github.com/paradoxxxzero/gnome-shell-system-monitor-applet
    if (mount.length < 3)
        return false;

    return ((mount[0].indexOf("/dev/") == 0 || mount[2].toLowerCase() == "nfs") && mount[2].toLowerCase() != "udf");
}

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
	_mounts: new Array(),
    _gtop_cpu: 0,
    _gtop_mem: 0,

	_mount_insert_index: 0, // index after which mount entries are inserted

    _timeout: null,
	_refresh_rate: 2,

    _settingConnectID: null,

    _init: function() {
        this.parent(0.0, "SystemInfoIndicator");
        let hbox = new St.BoxLayout({ style_class: "panel-status-menu-box",
                                      style: "spacing: 5px;"
        });
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
		
		this._mount_insert_index = this.menu.numMenuItems;
		this.refresh_mounts();

	    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        let systemMonitorItem = new PopupMenu.PopupMenuItem(_("System Monitor"));
        systemMonitorItem.connect("activate", Lang.bind(this, this.show_systemmonitor));
        this.menu.addMenuItem(systemMonitorItem);

        let settingsItem = new PopupMenu.PopupMenuItem(_("Settings"));
        settingsItem.connect("activate", Lang.bind(this, this.show_settings));
        this.menu.addMenuItem(settingsItem);

        // refresh items when menu is opened
        this.menu.connect("open-state-changed", Lang.bind(this, this.refresh));
		// the timeout is sometimes not working after suspend, this restarts it everytime the label is clicked
        this.menu.connect("open-state-changed", Lang.bind(this, this.init_timeout));

        // update refresh rate when settings change
        this._settingConnectID = settings.connect("changed", Lang.bind(this, this.load_settings));

        this.load_settings();
        this.refresh();
    },

    destroy: function() {
        Mainloop.source_remove(this._timeout);
        this._timeout = null;

        if(this._settingConnectID) {
            settings.disconnect(this._settingConnectID);
            this._settingConnectID = null;
        }

		this.parent();
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

		this.refresh_mounts();

        // only update menu items if the menu is open
        if(this.menu.isOpen) {
            for(let i=0; i<this._cpus.length; ++i) {
                this._cpus[i].refresh();
            }
            if(this._mem)
                this._mem.refresh();
            if(this._swap)
                this._swap.refresh();
            for(let i=0; i<this._mounts.length; ++i) {
                this._mounts[i].refresh();
            }
        }
    },

	refresh_mounts: function() {
		// mounts can change anytime, so the menu cannot be static like for cpus
		for (let i=0; i<this._mounts.length; ++i) {
			this._mounts[i].destroy();
		}
		this._mounts = []

		let show_mounts = settings.get_boolean("show-mounts");
		if (show_mounts) {
			try {
				// from https://github.com/paradoxxxzero/gnome-shell-system-monitor-applet
				// couldn't figure out what glibtop_get_mountlist is supposed to return
				let mount_lines = Shell.get_file_contents_utf8_sync('/etc/mtab').split("\n");
				let mounts = []
					for(let mount_line in mount_lines) {
						let mount = mount_lines[mount_line].split(" ");
						if(interesting_mountpoint(mount) && mounts.indexOf(mount[1]) < 0) {
							mounts.push(mount[1]);
						}
					}
				for(let i=0; i<mounts.length; ++i) {
					this._mounts[i] = new Mount(mounts[i]);
					this.menu.addMenuItem(this._mounts[i], this._mount_insert_index+i);
				}
			} catch(e) {
				log(e);
			}
		}
	},

    show_settings: function () {
        Util.spawn([
            "gnome-shell-extension-prefs",
            Me.uuid
        ]);
    },

    show_systemmonitor: function() {
        Util.spawnApp(["gnome-system-monitor"]);
    },

	init_timeout: function() {
        if(this._timeout) {
            Mainloop.source_remove(this._timeout);
        }
		
        // call refresh in fixed intervals (timeout_add_seconds has more efficient system power usage)
		this._timeout = Mainloop.timeout_add_seconds(this._refresh_rate, Lang.bind(this, function() {
            this.refresh();
            return true; // restart timeout
        }));
	},

    load_settings: function() {
        let refresh_rate = settings.get_int("refresh-rate");
        if(isNaN(refresh_rate)) {
            log("Invalid refresh-rate");
            refresh_rate = 2;
        }
        this._refresh_rate = Math.max(1, refresh_rate);
		this.init_timeout();

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
    Main.panel.addToStatusArea("SystemInfoIndicator", systemInfoIndicator, 0, "right");
}

function disable() {
    systemInfoIndicator.destroy();
}
