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

        let refresh_rate_label = new Gtk.Label({ label: _("Refresh rate"),
                                 halign: Gtk.Align.START,
                                 hexpand: true });

        let refresh_rate = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 500,
                upper: 100000,
                step_increment: 500
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

        this._settings = Convenience.getSettings();
        this._settings.bind('refresh-rate', refresh_rate, 'value', Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('show-memory', show_memory, 'active', Gio.SettingsBindFlags.DEFAULT);
    }
});

function buildPrefsWidget() {
    let widget = new SystemInfoPrefsWidget();
    widget.show_all();

    return widget;
}
