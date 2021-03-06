const Mainloop  = imports.mainloop;
const GLib      = imports.gi.GLib;
const St        = imports.gi.St;
const Clutter   = imports.gi.Clutter;
const GObject   = imports.gi.GObject;
const Shell     = imports.gi.Shell;
const Main      = imports.ui.main;
const PanelMenu	= imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Util      = imports.misc.util;

const Gettext = imports.gettext.domain("gnome-shell-extensions");
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const GTop = imports.gi.GTop;

let systemInfoIndicator;
let settings;

var Cpu = GObject.registerClass({},
  class Cpu extends PopupMenu.PopupMenuItem {
    _init(cpu_indices) {
      super._init("", {});
      this.indices = cpu_indices;
      this._parent = 0;
      this._gtop_cpu = 0;
      this._last_total = 0;
      this._last_idle = 0;

      try {
        this._gtop_cpu = new GTop.glibtop_cpu();
      } catch(e) {
        log(e);
      }

      this.refresh();
    }

    refresh() {
      GTop.glibtop_get_cpu(this._gtop_cpu);

      let total = 0;
      let idle = 0;
      let num_indices = this.indices.length;
      for(let i=0; i<num_indices; ++i) {
        let index = this.indices[i];
        total += this._gtop_cpu.xcpu_total[index];
        idle += this._gtop_cpu.xcpu_idle[index];
      }
      total = total/num_indices;
      idle = idle/num_indices;

      var rel_total = total - this._last_total;
      var rel_idle = idle - this._last_idle;

      // only update text if changed
      if(total > 0) {
        // display the percentage of the total cpu time that is not idle
        let cpu_percentage = (100.0 - (rel_idle / rel_total)*100).toFixed(1);
        let indices_text = this.indices[0];
        if (num_indices > 1)
          indices_text += " - " + this.indices[num_indices-1];
        this.label.text = "CPU " + indices_text + ": " + cpu_percentage.toString() + "%";
      }

      this._last_total = total;
      this._last_idle = idle;
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

var Mem = GObject.registerClass({},
  class Mem extends PopupMenu.PopupMenuItem {
    _init() {
      super._init("", {});

      try {
        this._gtop_mem = new GTop.glibtop_mem();
      } catch(e) {
        this._gtop_mem = null;
        log(e);
      }

      this.refresh();
    }

    refresh() {
      GTop.glibtop_get_mem(this._gtop_mem);
      let total = this._gtop_mem.total;
      let used = this._gtop_mem.user;

      this.label.text = _("Memory") + ": " + get_byte_usage_string(total, used);
    }
  });

var Swap = GObject.registerClass({},
  class Swap extends PopupMenu.PopupMenuItem {
    _init() {
      super._init("", {});

      try {
        this._gtop_swap = new GTop.glibtop_swap();
      } catch(e) {
        this._gtop_swap = null;
        log(e);
      }

      this.refresh();
    }

    refresh() {
      GTop.glibtop_get_swap(this._gtop_swap);
      let total = this._gtop_swap.total;
      let used = this._gtop_swap.used;

      this.label.text = _("Swap") + ": " + get_byte_usage_string(total, used);
    }
  });

var Mount = GObject.registerClass({},
  class Mount extends PopupMenu.PopupMenuItem {
    _init(mount_point) {
      super._init("", {});

      this._mount_point = mount_point;
      try {
        this._gtop_fsusage = new GTop.glibtop_fsusage();
      } catch(e) {
        this._gtop_fsusage = null;
        log(e);
      }

      this.refresh();
    }

    refresh() {
      GTop.glibtop_get_fsusage(this._gtop_fsusage, this._mount_point);
      let total = this._gtop_fsusage.blocks * this._gtop_fsusage.block_size;
      let free = this._gtop_fsusage.bavail * this._gtop_fsusage.block_size; // available for non-superusers
      let used = total - this._gtop_fsusage.bfree * this._gtop_fsusage.block_size;

      let text = "Unavailable";
      if(total > 0) {
        let percentage = ((used / total)*100).toFixed(1);
        // convert to nicer display string including unit
        total = GLib.format_size_full(total, GLib.FormatSizeFlags.DEFAULT)
        free = GLib.format_size_full(free, GLib.FormatSizeFlags.DEFAULT)
        let ratio = free + " free of " + total;
        text = ratio + " (" + percentage.toString() + "% used)";
      }

      this.label.text = this._mount_point + "\n" + text;
    }
  });

function interesting_mountpoint(mount){
    // from https://github.com/paradoxxxzero/gnome-shell-system-monitor-applet
    if (mount.length < 3)
        return false;

    if (mount[2].toLowerCase() == "udf")
      return false;
    if (mount[2].toLowerCase() == "nfs")
      return true;
    if (mount[0].indexOf("/var/lib/docker") == 0)
      return false;
    if (mount[1].indexOf("/snap") == 0)
      return false;
    if (mount[0].indexOf("/dev/") == 0)
      return true;
    return false;
}


var SystemInfoIndicator = GObject.registerClass({},
  class SystemInfoIndicatorClass extends PanelMenu.Button {
    _init() {
        super._init(0.0, "SystemInfoIndicator");

        this._cpu_label = null;
        this._mem_text = null;
        this._mem_label = null;

        this._last_total = 0;
        this._last_idle = 0;

        this._cpus = new Array();
        this._mem = 0;
        this._swap = 0;
        this._mounts = new Array();
        this._gtop_cpu = 0;
        this._gtop_mem = 0;

        this._timeout = null;
        this._refresh_rate = 2;
        this._cpus_per_group = 1;

        this._settingConnectID = null;

        let hbox = new St.BoxLayout({
            style_class: "panel-status-menu-box",
            style: "spacing: 5px;"
        });
        let cpu_text = new St.Label({
            text: "CPU:",
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });

        this._cpu_label = new St.Label({
            text: "0%",
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });

        this._mem_text = new St.Label({
            text: "Mem:",
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });

        this._mem_label = new St.Label({
            text: "0%",
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });

        hbox.add_child(cpu_text);
        hbox.add_child(this._cpu_label);
        hbox.add_child(this._mem_text);
        hbox.add_child(this._mem_label);
        this.add_child(hbox);

        try {
            this._gtop_cpu = new GTop.glibtop_cpu();
            this._gtop_mem = new GTop.glibtop_mem();

            this.refresh_cpus();
        } catch(e) {
            log(e);
        }

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._mem = new Mem();
        this.menu.addMenuItem(this._mem);

        this._swap = new Swap();
        this.menu.addMenuItem(this._swap);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
      
        this.refresh_mounts();

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        let systemMonitorItem = new PopupMenu.PopupMenuItem(_("System Monitor"));
        systemMonitorItem.connect("activate", () => {
            this.show_systemmonitor();
        });
        this.menu.addMenuItem(systemMonitorItem);

        let settingsItem = new PopupMenu.PopupMenuItem(_("Settings"));
        settingsItem.connect("activate", () => {
            this.show_settings();
        });
        this.menu.addMenuItem(settingsItem);

        // refresh items when menu is opened
        this.menu.connect("open-state-changed", () => {
            this.refresh();
        });
        // the timeout is sometimes not working after suspend, this restarts it everytime the label is clicked
        this.menu.connect("open-state-changed", () => {
            this.init_timeout();
        });

        // update refresh rate when settings change
        this._settingConnectID = settings.connect("changed", () => {
            this.load_settings();
        });

        this.load_settings();
        this.refresh();
    }

    destroy() {
        Mainloop.source_remove(this._timeout);
        this._timeout = null;

        if(this._settingConnectID) {
            settings.disconnect(this._settingConnectID);
            this._settingConnectID = null;
        }

        super.destroy();
    }

    refresh() {
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
    }

    // Queries the number of CPUs and groups them according to current settings
    refresh_cpus() {
      for (let i=0; i<this._cpus.length; ++i) {
        this._cpus[i].destroy();
      }
      this._cpus = []

      let numcpus = GTop.glibtop_get_sysinfo().ncpu + 1; //somehow 0 means 1 cpu
      for(let i=0; i<numcpus; i+=this._cpus_per_group) {
        let cpu_indices = [];
        for(let j=0; j<this._cpus_per_group; ++j) {
          cpu_indices.push(i+j);
        }
        let cpu = new Cpu(cpu_indices);
        this._cpus.push(cpu);
        this.menu.addMenuItem(cpu, i/this._cpus_per_group);
      }
    }

    refresh_mounts() {
      // mounts can change anytime, so the menu cannot be static 
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

          let mount_insert_index = this.menu.numMenuItems - 3; // afterwards: separator, system monitor, settings
          for(let i=0; i<mounts.length; ++i) {
            this._mounts[i] = new Mount(mounts[i]);
            this.menu.addMenuItem(this._mounts[i], mount_insert_index+i);
          }
        } catch(e) {
          log(e);
        }
      }
    }

    show_settings() {
        Util.spawn([
            "gnome-shell-extension-prefs",
            Me.uuid
        ]);
    }

    show_systemmonitor() {
        Util.trySpawn(["gnome-system-monitor"]);
    }

    init_timeout() {
        if(this._timeout) {
            Mainloop.source_remove(this._timeout);
        }

        // call refresh in fixed intervals (timeout_add_seconds has more efficient system power usage)
        this._timeout = Mainloop.timeout_add_seconds(this._refresh_rate, () => {
            this.refresh();
            return true; // restart timeout
        });
    }

    load_settings() {
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

        let cpus_per_group = settings.get_int("group-cpus");
        switch(cpus_per_group) { // matches the values in prefs.js
        case 0:
          cpus_per_group = 1;
          break;
        case 1:
          cpus_per_group = 2;
          break;
        case 2:
          cpus_per_group = 4;
          break;
        default:
          cpus_per_group = 1;
        }
        this._cpus_per_group = cpus_per_group;
        this.refresh_cpus();

        this.refresh();
    }
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
