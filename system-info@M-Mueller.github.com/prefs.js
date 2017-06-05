// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-

const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

function init() {
    Convenience.initTranslations();
}

const SystemInfoPrefsWidget = new GObject.Class({
    Name: 'SystemInfo.Prefs.Widget',
    GTypeName: 'SystemInfoPrefsWidget',
    Extends: Gtk.Grid,

    _init: function(params) {
        this.parent(params);
        this.margin = 12;
        this.row_spacing = this.column_spacing = 6;
        this.set_orientation(Gtk.Orientation.HORIZONTAL);

        let refresh_rate_label = new Gtk.Label({ label: _("Refresh rate (seconds)"),
                                 halign: Gtk.Align.START,
                                 hexpand: true });

        let refresh_rate = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 100,
                step_increment: 1
            })
        });
        this.attach(refresh_rate_label, 0, 0, 1, 1);
        this.attach(refresh_rate, 1, 0, 1, 1);

        let show_memory_label = new Gtk.Label({ label: _("Show memory in panel"),
                                 halign: Gtk.Align.START,
                                 hexpand: true });

        let show_memory = new Gtk.Switch({ halign: Gtk.Align.START });
        this.attach(show_memory_label, 0, 1, 1, 1);
        this.attach(show_memory, 1, 1, 1, 1);

        let show_mounts_label = new Gtk.Label({ label: _("Show filesystem usage"),
                                 halign: Gtk.Align.START,
                                 hexpand: true });

        let show_mounts = new Gtk.Switch({ halign: Gtk.Align.START });
        this.attach(show_mounts_label, 0, 2, 1, 1);
        this.attach(show_mounts, 1, 2, 1, 1);

        let group_cpus_label = new Gtk.Label({ label: _("Group CPUs"),
                                 halign: Gtk.Align.START,
                                 hexpand: true });

        let group_cpus = new Gtk.ComboBoxText({ halign: Gtk.Align.START });
		group_cpus.append_text('None');
		group_cpus.append_text('2');
		group_cpus.append_text('4');
        this.attach(group_cpus_label, 0, 3, 1, 1);
        this.attach(group_cpus, 1, 3, 1, 1);

        this._settings = Convenience.getSettings();
        this._settings.bind('refresh-rate', refresh_rate, 'value', Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('show-memory', show_memory, 'active', Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('show-mounts', show_mounts, 'active', Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('group-cpus', group_cpus, 'active', Gio.SettingsBindFlags.DEFAULT);
    }
});

function buildPrefsWidget() {
    let widget = new SystemInfoPrefsWidget();
    widget.show_all();

    return widget;
}
