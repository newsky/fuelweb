define(
[
    'utils',
    'models',
    'views/common',
    'views/dialogs',
    'text!templates/cluster/nodes_tab_summary.html',
    'text!templates/cluster/edit_nodes_screen.html',
    'text!templates/cluster/node_list.html',
    'text!templates/cluster/node.html',
    'text!templates/cluster/node_status.html',
    'text!templates/cluster/edit_node_disks.html',
    'text!templates/cluster/node_disk.html',
    'text!templates/cluster/edit_node_interfaces.html',
    'text!templates/cluster/node_interfaces.html'
],
function(models, commonViews, dialogViews, nodesTabSummaryTemplate, editNodesScreenTemplate, nodeListTemplate, nodeTemplate, nodeStatusTemplate, editNodeDisksScreenTemplate, nodeDisksTemplate, editNodeInterfacesScreenTemplate, nodeInterfacesTemplate) {
    'use strict';
    var NodesTab, Screen, NodesByRolesScreen, EditNodesScreen, AddNodesScreen, DeleteNodesScreen, NodeList, Node, EditNodeScreen, EditNodeDisksScreen, NodeDisk, EditNodeInterfacesScreen, NodeInterface;

    NodesTab = commonViews.Tab.extend({
        screen: null,
        scrollPositions: {},
        changeScreen: function(NewScreenView, screenOptions) {
            var options = _.extend({model: this.model, tab: this, screenOptions: screenOptions || []});
            var newScreen = new NewScreenView(options);
            var oldScreen = this.screen;
            if (oldScreen) {
                if (oldScreen.keepScrollPosition) {
                    this.scrollPositions[oldScreen.constructorName] = $(window).scrollTop();
                }
                oldScreen.$el.fadeOut('fast', _.bind(function() {
                    oldScreen.tearDown();
                    newScreen.render();
                    newScreen.$el.hide().fadeIn('fast');
                    this.$el.html(newScreen.el);
                    if (newScreen.keepScrollPosition && this.scrollPositions[newScreen.constructorName]) {
                        $(window).scrollTop(this.scrollPositions[newScreen.constructorName]);
                    }
                }, this));
            } else {
                this.$el.html(newScreen.render().el);
            }
            this.screen = newScreen;
            this.registerSubView(this.screen);
        },
        initialize: function(options) {
            _.defaults(this, options);
        },
        routeScreen: function(options) {
            var screens = {
                'list': NodesByRolesScreen,
                'add': AddNodesScreen,
                'delete': DeleteNodesScreen,
                'disks': EditNodeDisksScreen,
                'interfaces': EditNodeInterfacesScreen
            };
            this.changeScreen(screens[options[0]] || screens.list, options.slice(1));
        },
        render: function() {
            this.routeScreen(this.tabOptions);
            return this;
        }
    });

    var NodesTabSummary = Backbone.View.extend({
        template: _.template(nodesTabSummaryTemplate),
        events: {
            'click .change-cluster-mode-btn:not(.disabled)': 'changeClusterMode',
            'click .change-cluster-type-btn:not(.disabled)': 'changeClusterType'
        },
        changeClusterMode: function() {
            var dialog = new dialogViews.ChangeClusterModeDialog({model: this.model});
            this.registerSubView(dialog);
            dialog.render();
        },
        changeClusterType: function() {
            var dialog = new dialogViews.ChangeClusterTypeDialog({model: this.model});
            this.registerSubView(dialog);
            dialog.render();
        },
        initialize: function(options) {
            this.model.on('change:status', this.render, this);
        },
        render: function() {
            this.$el.html(this.template({cluster: this.model}));
            return this;
        }
    });

    Screen = Backbone.View.extend({
        constructorName: 'Screen',
        keepScrollPosition: false
    });

    NodesByRolesScreen = Screen.extend({
        className: 'nodes-by-roles-screen',
        constructorName: 'NodesByRolesScreen',
        keepScrollPosition: true,
        initialize: function(options) {
            this.tab = options.tab;
            this.model.on('change:mode change:type change:status', this.render, this);
            this.model.get('nodes').on('resize', this.render, this);
            this.model.get('tasks').each(this.bindTaskEvents, this);
            this.model.get('tasks').on('add', this.onNewTask, this);
        },
        bindTaskEvents: function(task) {
            return (task.get('name') == 'deploy' || task.get('name') == 'verify_networks') ? task.on('change:status', this.render, this) : null;
        },
        onNewTask: function(task) {
            return this.bindTaskEvents(task) && this.render();
        },
        render: function() {
            this.tearDownRegisteredSubViews();
            this.$el.html('');
            var summary = new NodesTabSummary({model: this.model});
            this.registerSubView(summary);
            this.$el.append(summary.render().el);
            var roles = this.model.availableRoles();
            _.each(roles, function(role, index) {
                var nodes = new models.Nodes(this.model.get('nodes').where({role: role}));
                nodes.cluster = this.model;
                var nodeListView = new NodeList({
                    collection: nodes,
                    role: role,
                    tab: this.tab
                });
                this.registerSubView(nodeListView);
                this.$el.append(nodeListView.render().el);
                if (index < roles.length - 1) {
                    this.$el.append('<hr>');
                }
            }, this);
            return this;
        }
    });

    EditNodesScreen = Screen.extend({
        className: 'edit-nodes-screen',
        constructorName: 'EditNodesScreen',
        keepScrollPosition: false,
        template: _.template(editNodesScreenTemplate),
        events: {
            'click .btn-discard': 'discardChanges',
            'click .btn-apply:not([disabled])': 'applyChanges',
            'click .nodebox': 'toggleNode',
            'click .select-all-tumbler': 'selectAll'
        },
        toggleNode: function(e) {
            if ($(e.target).closest(this.$('.node-hardware')).length) {return;}
            if (this.limit !== null && $(e.currentTarget).is('.node-to-' + this.action + '-unchecked') && this.$('.node-to-' + this.action + '-checked').length >= this.limit) {
                return;
            }
            $(e.currentTarget).toggleClass('node-to-' + this.action + '-checked').toggleClass('node-to-' + this.action + '-unchecked');
            this.calculateSelectAllTumblerState();
            this.calculateNotChosenNodesAvailability();
            this.calculateApplyButtonAvailability();
            utils.forceWebkitRedraw(this.$('.nodebox'));
        },
        selectAll: function(e) {
            var checked = $(e.currentTarget).is(':checked');
            this.$('.nodebox').toggleClass('node-to-' + this.action + '-checked', checked).toggleClass('node-to-' + this.action + '-unchecked', !checked);
            this.calculateApplyButtonAvailability();
            utils.forceWebkitRedraw(this.$('.nodebox'));
        },
        calculateSelectAllTumblerState: function() {
            this.$('.select-all-tumbler').attr('checked', this.nodes.length == this.$('.node-to-' + this.action + '-checked').length);
        },
        calculateNotChosenNodesAvailability: function() {
            if (this.limit !== null) {
                var chosenNodesCount = this.$('.node-to-' + this.action + '-checked').length;
                var notChosenNodes = this.$('.nodebox:not(.node-to-' + this.action + '-checked)');
                notChosenNodes.toggleClass('node-not-checkable', chosenNodesCount >= this.limit);
            }
        },
        calculateApplyButtonAvailability: function() {
            this.$('.btn-apply').attr('disabled', !this.getChosenNodesIds().length);
        },
        discardChanges: function() {
            app.navigate('#cluster/' + this.model.id + '/nodes', {trigger: true});
        },
        applyChanges: function(e) {
            this.$('.btn-apply').attr('disabled', true);
            var nodes = new models.Nodes(this.getChosenNodes());
            // remove change events to prevent ugly rerendering right before changing the screen
            _(this.subViews).each(function(view) {
                view.model.off('change:pending_addition change:pending_deletion', view.render, view);
            }, this);
            this.modifyNodes(nodes);
            nodes.sync('update', nodes).done(_.bind(function() {
                app.navigate('#cluster/' + this.model.id + '/nodes', {trigger: true});
                this.model.get('nodes').fetch({data: {cluster_id: this.model.id}});
                app.navbar.refresh();
                app.page.removeVerificationTask();
            }, this));
        },
        getChosenNodesIds: function() {
            return this.$('.node-to-' + this.action + '-checked').map(function() {return parseInt($(this).attr('data-node-id'), 10);}).get();
        },
        getChosenNodes: function() {
            var chosenNodesIds = this.getChosenNodesIds();
            return this.nodes.filter(function(node) {return _.contains(chosenNodesIds, node.id);});
        },
        initialize: function(options) {
            _.defaults(this, options);
            if (_.contains(this.model.availableRoles(), this.screenOptions[0])) {
                this.role = this.screenOptions[0];
            } else {
                app.navigate('#cluster/' + this.model.id + '/nodes', {trigger: true, replace: true});
            }
        },
        renderNodes: function() {
            this.tearDownRegisteredSubViews();
            var nodesContainer = this.$('.available-nodes');
            if (this.nodes.length && this.limit !== 0) {
                nodesContainer.html('');
                this.nodes.each(function(node) {
                    var options = {model: node};
                    if (this.action == 'add') {
                        options.selectableForAddition = true;
                    } else if (this.action == 'delete') {
                        options.selectableForDeletion = true;
                    }
                    var nodeView = new Node(options);
                    this.registerSubView(nodeView);
                    nodesContainer.append(nodeView.render().el);
                    if (node.get(this.flag)) {
                        nodeView.$('.nodebox[data-node-id=' + node.id + ']').addClass('node-to-' + this.action + '-checked').removeClass('node-to-' + this.action + '-unchecked');
                    }
                }, this);
            } else {
                nodesContainer.html('<div class="span12">No nodes available</div>');
            }
        },
        render: function() {
            this.$el.html(this.template({nodes: this.nodes, role: this.role, action: this.action, limit: this.limit}));
            if (!this.nodes.deferred || this.nodes.deferred.state() != 'pending') {
                this.renderNodes();
            }
            return this;
        }
    });

    AddNodesScreen = EditNodesScreen.extend({
        className: 'add-nodes-screen',
        constructorName: 'AddNodesScreen',
        action: 'add',
        flag: 'pending_addition',
        initialize: function(options) {
            this.constructor.__super__.initialize.apply(this, arguments);
            this.limit = null;
            if (this.role == 'controller' && this.model.get('mode') != 'ha') {
                this.limit = _.filter(this.model.get('nodes').nodesAfterDeployment(), function(node) {return node.get('role') == this.role;}, this).length ? 0 : 1;
            }
            this.nodes = new models.Nodes();
            this.nodes.deferred = this.nodes.fetch({data: {cluster_id: ''}}).done(_.bind(function() {
                this.nodes.add(this.model.get('nodes').where({role: this.role, pending_deletion: true}), {at: 0});
                this.render();
            }, this));
        },
        modifyNodes: function(nodes) {
            nodes.each(function(node) {
                if (node.get('pending_deletion')) {
                    node.set({pending_deletion: false});
                } else {
                    node.set({
                        cluster_id: this.model.id,
                        role: this.role,
                        pending_addition: true
                    });
                }
            }, this);
            nodes.toJSON = function(options) {
                return this.map(function(node) {
                    return _.pick(node.attributes, 'id', 'cluster_id', 'role', 'pending_addition', 'pending_deletion');
                });
            };
        }
    });

    DeleteNodesScreen = EditNodesScreen.extend({
        className: 'delete-nodes-screen',
        constructorName: 'DeleteNodesScreen',
        action: 'delete',
        flag: 'pending_deletion',
        initialize: function(options) {
            _.defaults(this, options);
            this.limit = null;
            this.constructor.__super__.initialize.apply(this, arguments);
            this.nodes = new models.Nodes(this.model.get('nodes').filter(_.bind(function(node) {
                return node.get('role') == this.role && (node.get('pending_addition') || !node.get('pending_deletion'));
            }, this)));
        },
        modifyNodes: function(nodes) {
            nodes.each(function(node) {
                if (node.get('pending_addition')) {
                    node.set({
                        cluster_id: null,
                        role: null,
                        pending_addition: false
                    });
                } else {
                    node.set({pending_deletion: true});
                }
            }, this);
            nodes.toJSON = function(options) {
                return this.map(function(node) {
                    return _.pick(node.attributes, 'id', 'cluster_id', 'role', 'pending_addition', 'pending_deletion');
                });
            };
        }
    });

    NodeList = Backbone.View.extend({
        className: 'node-list',
        template: _.template(nodeListTemplate),
        initialize: function(options) {
            _.defaults(this, options);
        },
        render: function() {
            this.tearDownRegisteredSubViews();
            var placeholders = this.role == 'controller' ? this.collection.cluster.get('mode') == 'ha' ? 3 : 1 : 0;
            this.$el.html(this.template({
                cluster: this.collection.cluster,
                nodes: this.collection,
                role: this.role,
                placeholders: placeholders
            }));
            this.$el.addClass('node-list-' + this.role);
            if (this.collection.length || placeholders) {
                var container = this.$('.node-list-container');
                this.collection.each(function(node) {
                    var nodeView = new Node({model: node, renameable: !this.collection.cluster.task('deploy', 'running')});
                    this.registerSubView(nodeView);
                    container.append(nodeView.render().el);
                }, this);
                var placeholdersToRender = placeholders - this.collection.nodesAfterDeployment().length;
                if (placeholdersToRender > 0) {
                    _(placeholdersToRender).times(function() {
                        container.append('<div class="span2 nodebox nodeplaceholder"></div>');
                    });
                }
            }
            return this;
        }
    });

    Node = Backbone.View.extend({
        template: _.template(nodeTemplate),
        nodeStatusTemplate: _.template(nodeStatusTemplate),
        events: {
            'click .node-name': 'startNodeRenaming',
            'keydown .node-renameable': 'onNodeNameInputKeydown',
            'click .node-hardware': 'showNodeInfo'
        },
        startNodeRenaming: function() {
            if (!this.renameable || this.renaming || this.model.collection.cluster.task('deploy', 'running')) {return;}
            $('html').off(this.eventNamespace);
            $('html').on(this.eventNamespace, _.after(2, _.bind(function(e) {
                if (!$(e.target).closest(this.$('.node-renameable input')).length) {
                    this.endNodeRenaming();
                }
            }, this)));
            this.renaming = true;
            this.render();
            this.$('.node-renameable input').focus();
        },
        endNodeRenaming: function() {
            $('html').off(this.eventNamespace);
            this.renaming = false;
            this.render();
        },
        applyNewNodeName: function() {
            var name = $.trim(this.$('.node-renameable input').val());
            if (name && name != this.model.get('name')) {
                this.$('.node-renameable input').attr('disabled', true);
                this.model.save({name: name}, {patch: true, wait: true}).always(_.bind(this.endNodeRenaming, this));
            } else {
                this.endNodeRenaming();
            }
        },
        onNodeNameInputKeydown: function(e) {
            if (e.which == 13) {
                this.applyNewNodeName();
            } else if (e.which == 27) {
                this.endNodeRenaming();
            }
        },
        showNodeInfo: function() {
            var clusterId, deployment = false;
            try {
                clusterId = app.page.tab.model.id;
                deployment = !!app.page.tab.model.task('deploy', 'running');
            } catch(e) {}
            var dialog = new dialogViews.ShowNodeInfoDialog({
                node: this.model,
                clusterId: clusterId,
                deployment: deployment
            });
            app.page.tab.registerSubView(dialog);
            dialog.render();
        },
        updateProgress: function() {
            if (this.model.get('status') == 'provisioning' || this.model.get('status') == 'deploying') {
                var progress = this.model.get('progress') || 0;
                this.$('.bar').css('width', (progress > 3 ? progress : 3) + '%');
            }
        },
        updateStatus: function() {
            this.$('.node-status').html(this.nodeStatusTemplate({
                node: this.model,
                logsLink: this.getLogsLink()
            }));
            this.updateProgress();
        },
        getLogsLink: function() {
            var status = this.model.get('status');
            var error = this.model.get('error_type');
            var options = {type: 'remote', node: this.model.id};
            if (status == 'discover') {
                options.source = 'bootstrap/messages';
            } else if (status == 'provisioning' || status == 'provisioned' || (status == 'error' && error == 'provision')) {
                options.source = 'install/anaconda';
            } else if (status == 'deploying' || status == 'ready' || (status == 'error' && error == 'deploy')) {
                options.source = 'install/puppet';
            }
            return '#cluster/' + app.page.model.id + '/logs/' + utils.serializeTabOptions(options);
        },
        beforeTearDown: function() {
            $('html').off(this.eventNamespace);
        },
        checkForOfflineEvent: function() {
            var updatedNode = app.navbar.nodes.get(this.model.id);
            if (updatedNode && updatedNode.get('online') != this.model.get('online')) {
                this.model.set({online: updatedNode.get('online')});
            }
        },
        initialize: function(options) {
            _.defaults(this, options);
            this.renaming = false;
            this.eventNamespace = 'click.editnodename' + this.model.id;
            this.model.on('change:name change:pending_addition change:pending_deletion', this.render, this);
            this.model.on('change:status change:online', this.updateStatus, this);
            this.model.on('change:progress', this.updateProgress, this);
            app.navbar.nodes.on('sync', this.checkForOfflineEvent, this);
        },
        render: function() {
            this.$el.html(this.template({
                node: this.model,
                renaming: this.renaming,
                renameable: this.renameable,
                selectableForAddition: this.selectableForAddition,
                selectableForDeletion: this.selectableForDeletion
            }));
            this.updateStatus();
            return this;
        }
    });

    EditNodeScreen = Screen.extend({
        constructorName: 'EditNodeScreen',
        keepScrollPosition: false
    });

    EditNodeDisksScreen = EditNodeScreen.extend({
        className: 'edit-node-disks-screen',
        constructorName: 'EditNodeDisksScreen',
        template: _.template(editNodeDisksScreenTemplate),
        pow: Math.pow(1000, 3),
        events: {
            'click .btn-defaults': 'loadDefaults',
            'click .btn-revert-changes': 'revertChanges',
            'click .btn-apply:not(:disabled)': 'applyChanges',
            'click .btn-back-to-cluster:not(:disabled)': 'backToCluster'
        },
        formatFloat: function(value) {
            return parseFloat((value / this.pow).toFixed(2));
        },
        disableControls: function(disable) {
            this.$('.btn, input').attr('disabled', disable);
        },
        checkForChanges: function() {
            this.$('.btn-apply').attr('disabled', _.isEqual(_.where(this.disks.toJSON(), {'type': 'disk'}), _.where(this.initialData, {'type': 'disk'})) || _.some(this.disks.models, 'validationError'));
        },
        loadDefaults: function() {
            this.disableControls(true);
            var defaultDisks = new models.Disks();
            defaultDisks.fetch({
                url: _.result(this.node, 'url') + '/attributes/volumes/defaults/',
                data: {type: 'disk'}
            })
            .done(_.bind(function() {
                this.disks = defaultDisks;
                this.setRoundedValues();
                this.render();
                this.checkForChanges();
            }, this))
            .fail(_.bind(function() {
                this.disableControls(false);
                this.checkForChanges();
                var dialog = new dialogViews.SimpleMessage({error: true, title: 'Node disks configuration'});
                app.page.registerSubView(dialog);
                dialog.render();
            }, this));
        },
        revertChanges: function() {
            this.disks = new models.Disks(this.initialData);
            this.render();
        },
        applyChanges: function() {
            this.disableControls(true);
            // revert sizes to bytes
            _.each(this.getDisks(), _.bind(function(disk) {
                _.each(_.filter(disk.get('volumes'), {type: 'pv'}), _.bind(function(group) {
                    group.size = Math.round((group.size + this.remainders[disk.id][group.vg]) * this.pow);
                }, this));
            }, this));
            Backbone.sync('update', this.disks, {url: _.result(this.node, 'url') + '/attributes/volumes?type=disk'})
                .done(_.bind(function() {
                    this.model.fetch();
                    this.setRoundedValues();
                    this.initialData = _.cloneDeep(this.disks.toJSON());
                    this.render();
                }, this))
                .fail(_.bind(function() {
                    this.disableControls(false);
                    var dialog = new dialogViews.SimpleMessage({error: true, title: 'Node disks configuration'});
                    app.page.registerSubView(dialog);
                    dialog.render();
                }, this));
        },
        backToCluster: function() {
            app.navigate('#cluster/' + this.model.id + '/nodes', {trigger: true});
        },
        getGroupAllocatedSpace: function(group) {
            var allocatedSpace = 0;
            _.each(this.getDisks(), _.bind(function(disk) {
                var size = _.find(disk.get('volumes'), {vg: group}).size;
                if (size) {
                    allocatedSpace += size + 0.064;
                }
            }, this));
            return allocatedSpace;
        },
        setRoundedValues: function() {
            // reduce volume group sizes to two decimal places
            // for better representation on UI
            this.remainders = {};
            _.each(this.getDisks(), _.bind(function(disk) {
                this.remainders[disk.id] = {};
                this.remainders[disk.id].unallocated = (_.find(this.node.get('meta').disks, {disk: disk.id}).size / this.pow) % 0.01;
                _.each(disk.get('volumes'), _.bind(function(group) {
                    if (group.type == 'pv') {
                        var roundedSize = this.formatFloat(group.size);
                        this.remainders[disk.id][group.vg] = group.size / this.pow - roundedSize;
                        this.remainders[disk.id].unallocated -= this.remainders[disk.id][group.vg];
                        group.size = roundedSize;
                    }
                    if (group.type == 'partition') {
                        this.partitionSize = group.size;
                    }
                }, this));
                this.remainders[disk.id].unallocated -= (this.partitionSize / this.pow) % 0.01;
            }, this));
        },
        setMinimalSizes: function() {
            this.minimalSizes = {};
            _.each(this.disks.where({'type': 'vg'}), _.bind(function(group) {
                var minimalSize = 0;
                try {
                    minimalSize += _.find(group.get('volumes'), {name: 'root'}).size;
                    minimalSize += _.find(group.get('volumes'), {name: 'swap'}).size;
                } catch(e) {}
                this.minimalSizes[group.id] = this.formatFloat(minimalSize);
            }, this));
        },
        getDisks: function() {
            return this.disks.where({'type': 'disk'});
        },
        initialize: function(options) {
            _.defaults(this, options);
            this.node = this.model.get('nodes').get(this.screenOptions[0]);
            if (this.node) {
                this.disks = new models.Disks();
                $.when(this.node.fetch(), this.disks.fetch({url: _.result(this.node, 'url') + '/attributes/volumes'}))
                .done(_.bind(function() {
                        this.setRoundedValues();
                        this.setMinimalSizes();
                        this.initialData = _.cloneDeep(this.disks.toJSON());
                        this.render();
                    }, this))
                .fail(_.bind(this.backToCluster, this));
            } else {
                this.backToCluster();
            }
        },
        renderDisks: function() {
            this.tearDownRegisteredSubViews();
            this.$('.node-disks').html('');
            _.each(this.getDisks(), _.bind(function(disk) {
                var diskMetaData = _.find(this.node.get('meta').disks, {disk: disk.id});
                if (diskMetaData.size) {
                    var nodeDisk = new NodeDisk({
                        diskMetaData: diskMetaData,
                        disk: disk,
                        volumeGroups: this.node.volumeGroupsByRoles(this.node.get('role')),
                        remainders: this.remainders[disk.id],
                        partitionSize: this.partitionSize,
                        minimalSizes: this.minimalSizes,
                        screen: this
                    });
                    this.registerSubView(nodeDisk);
                    this.$('.node-disks').append(nodeDisk.render().el);
                }
            }, this));
        },
        render: function() {
            this.$el.html(this.template({node: this.node}));
            this.renderDisks();
            return this;
        }
    });

    NodeDisk = Backbone.View.extend({
        template: _.template(nodeDisksTemplate),
        templateHelpers: {
            sortEntryProperties: function(entry) {
                var properties = _.keys(entry);
                if (_.has(entry, 'name')) {
                    properties = ['name'].concat(_.keys(_.omit(entry, ['name', 'disk'])));
                }
                return properties;
            },
            showDiskSize: utils.showDiskSize
        },
        events: {
            'click .toggle-volume': 'toggleEditDiskForm',
            'click .close-btn': 'deleteVolumeGroup',
            'keyup input': 'editVolumeGroups',
            'click .use-all-unallocated': 'useAllUnallocatedSpace',
            'click .btn-bootable:not(:disabled)': 'switchBootableDisk'
        },
        formatFloat: function(value) {
            return this.screen.formatFloat(value);
        },
        toggleEditDiskForm: function(e) {
            this.$('.disk-edit-volume-group-form').collapse('toggle').toggleClass('hidden');
            _.each(this.volumesToDisplay(), _.bind(function(group) {
                this.checkForAvailableDeletion(group.vg);
            }, this));
        },
        checkForAvailableDeletion: function(group) {
            var groupSize = 0;
            _.each(_.filter(this.screen.disks.models, _.bind(function(disk) {return disk.id != this.disk.id && disk.get('type') == 'disk';}, this)), function(disk) {
                groupSize += _.find(disk.get('volumes'), {vg: group}).size;
            });
            var toggle = groupSize >= this.minimalSizes[group] && !this.$('.disk-edit-volume-group-form').hasClass('hidden');
            this.$('.disk-visual .' + group + ' .close-btn').toggle(toggle).toggleClass('hide', !toggle);
        },
        setVolumes: function(group, size, allUnallocated) {
            if (_.isUndefined(size)) {
                size = Number((this.$('input[name=' + group + ']').val()).replace(',', '.'));
            }
            this.$('input[name=' + group + ']').removeClass('error').parents('.volume-group').next().text('');
            var volumes = _.cloneDeep(this.volumes);
            var volume = _.find(volumes, {vg: group});
            var unallocated = (this.diskSize - this.countAllocatedSpace() + volume.size).toFixed(2);
            volume.size = allUnallocated ? volume.size + Number(size) : Number(size);
            var min = this.minimalSizes[group] - this.screen.getGroupAllocatedSpace(group) + _.find(this.disk.get('volumes'), {vg: group}).size;
            if (size !== 0) {
                min += 0.064;
            }
            this.disk.set({volumes: volumes}, {validate: true, unallocated: unallocated, group: group, min: min});
            this.getVolumes();
            if (allUnallocated || size === 0) {
                if (allUnallocated) {
                    this.$('input[name=' + group + ']').val(_.find(this.volumes, {vg: group}).size.toFixed(2));
                    this.remainders[volume.vg] += this.remainders.unallocated;
                    this.remainders.unallocated = 0;
                }
                if (size === 0) {
                    this.remainders.unallocated += this.remainders[volume.vg];
                    this.remainders[volume.vg] = 0;
                }
            }
            this.renderVisualGraph();
            this.checkForAvailableDeletion(group);
            this.screen.checkForChanges();
        },
        makeChanges: function(e, value, allUnallocated, deleteGroup) {
            var group = this.$(e.currentTarget).parents('.volume-group').data('group');
            if (deleteGroup) {
                this.$('input[name=' + group + ']').val('0.00');
            }
            this.setVolumes(group, value, allUnallocated);
            _.each(this.volumesToDisplay(), _.bind(function(volume) {
                _.invoke(this.screen.subViews, 'setVolumes', volume.vg);
            }, this));
        },
        deleteVolumeGroup: function(e) {
            this.makeChanges(e, 0, false, true);
        },
        editVolumeGroups: function(e) {
            this.makeChanges(e, Number((this.$(e.currentTarget).val()).replace(',', '.')));
        },
        countAllocatedSpace: function() {
            var volumes = this.volumesToDisplay();
            var allocatedSpace = _.reduce(volumes, _.bind(function(sum, volume) {return sum + volume.size;}, this), 0);
            if (this.partition) {
                allocatedSpace += this.formatFloat(this.partitionSize);
            }
            return allocatedSpace;
        },
        useAllUnallocatedSpace: function(e) {
            e.preventDefault();
            this.makeChanges(e, (this.diskSize - this.countAllocatedSpace()).toFixed(2), true);
        },
        switchBootableDisk: function(e) {
            _.each(this.screen.disks.models, function(disk) {
                disk.set({volumes: _.filter(disk.get('volumes'), function(group) { return group.type == 'pv' || group.type == 'lv'; })});
            });
            this.disk.set({volumes: _.union(this.disk.get('volumes'), [{type: 'partition', mount: '/boot', size: this.partitionSize}, {type: 'mbr'}])});
            _.invoke(this.screen.subViews, 'getPartition');
            _.invoke(this.screen.subViews, 'getVolumes');
            _.invoke(this.screen.subViews, 'renderVisualGraph');
            this.screen.$('.bootable-marker').hide();
            this.$('.bootable-marker').show();
            this.screen.checkForChanges();
        },
        getPartition: function() {
            this.partition = _.find(this.disk.get('volumes'), {type: 'partition'});
        },
        getVolumes: function() {
            this.volumes = this.disk.get('volumes');
        },
        initialize: function(options) {
            _.defaults(this, options);
            this.diskSize = this.formatFloat(this.diskMetaData.size - 1000000);
            this.getPartition();
            this.getVolumes();
            this.disk.on('invalid', function(model, errors) {
                _.each(_.keys(errors), _.bind(function(group) {
                    this.$('input[name=' + group + ']').addClass('error').parents('.volume-group').next().text(errors[group]);
                }, this));
            }, this);
        },
        volumesToDisplay: function() {
            return _.filter(this.volumes, _.bind(function(volume) {return _.contains(this.volumeGroups, volume.vg);}, this));
        },
        renderVisualGraph: function() {
            var diskSize = this.diskSize;
            if (this.partition) {
                diskSize -= this.formatFloat(this.partitionSize);
            }
            var unallocatedWidth = 100, unallocatedSize = diskSize;
            _.each(this.volumesToDisplay(), _.bind(function(volume) {
                var width = 0, size = 0;
                if (volume) {
                    width = (volume.size / diskSize * 100).toFixed(2);
                    size = volume.size;
                }
                unallocatedWidth -= width; unallocatedSize -= size;
                this.$('.disk-visual .' + volume.vg).toggleClass('hidden-titles', width < 6).css('width', width + '%').find('.volume-group-size').text(size.toFixed(2) + ' GB');
            }, this));
            this.$('.disk-visual .unallocated').toggleClass('hidden-titles', unallocatedWidth < 6).css('width', unallocatedWidth.toFixed(2) + '%').find('.volume-group-size').text(unallocatedSize.toFixed(2) + ' GB');
            this.$('.btn-bootable').attr('disabled', this.partition || unallocatedSize < this.formatFloat(this.partitionSize));
        },
        render: function() {
            this.$el.html(this.template(_.extend({
                disk: this.diskMetaData,
                volumes: this.volumesToDisplay(),
                partition: this.partition
            }, this.templateHelpers)));
            this.$('.disk-edit-volume-group-form').collapse({toggle: false}).addClass('hidden');
            this.renderVisualGraph();
            return this;
        }
    });

    EditNodeInterfacesScreen = EditNodeScreen.extend({
        className: 'edit-node-networks-screen',
        constructorName: 'EditInterfacesScreen',
        template: _.template(editNodeInterfacesScreenTemplate),
        events: {
            /*'click .btn-defaults': 'loadDefaults',*/
            'click .btn-revert-changes': 'returnToNodesTab',
            'click .btn-apply:not(:disabled)': 'applyChanges',
        },
        disableControls: function() {
            this.$('.btn, input').attr('disabled', true);
        },
        checkForChanges: function() {
            this.$('.btn-apply').attr('disabled', _.isEqual(this.interfaces.toJSON(), this.initialData));
        },
        loadDefaults: function() {
            // TODO (Ivan K): implement this
            /*this.disableControls();
            this.interfaces = new models.Interfaces();
            this.interfaces.fetch({
                url: _.result(this.node, 'url') + '/defaults/interfaces'
            }).always(_.bind(function() {
                    this.render();
                    this.checkForChanges();
                }, this));*/
        },
        removeNetwork: function(physical, logical){
            var ethIfc = this.interfaces.findWhere({name: physical}); //_.find(this.interfaces.models,function(ifc){return ifc.get("name")==physical})
            var ifType = _.first(_.where(ethIfc.get("networks"), {"name":logical}));
            ethIfc.set("networks", _.reject(ethIfc.get("networks"), {"name":logical}));
            return ifType;
        },
        addNetwork: function(physical, logical){
            var ethIfc = _.find(this.interfaces.models,
                                function(ifc){ return ifc.get("name")==physical });
            if (_.isUndefined(ethIfc.get("networks"))){
                ethIfc.set("networks", []);
            }
            ethIfc.get("networks").push(logical);
        },
        returnToNodesTab: function() {
            app.navigate('#cluster/' + this.model.id + '/nodes', {trigger: true, replace: true});
        },
        applyChanges: function() {
             Backbone.sync('update', this.interfaces, {url: _.result(this.node, 'url') + '/attributes/interfaces'})
                 .done(_.bind(function(){
                     this.returnToNodesTab();
                 }, this))
                 .error(_.bind(function(response, statusType, statusText) {
                    if (response.status == 409) {
                        this.topologies.models = this.topologies.parse(response);
                        var dialog = new dialogViews.UpdateInterfacesDialog({model: this.topologies.models, interfaces: this.interfaces, node: this.node});
                        this.registerSubView(dialog);
                        dialog.render();
                    } else {
                        //TODO: show error
                    }
                 }, this));
/*                 .fail(_.bind(function() {
                     this.$('.btn, input').attr('disabled', false);
                     var dialog = new dialogViews.SimpleMessage({error: true,
                                                                 title: 'Node network interfaces configuration error'});
                     app.page.registerSubView(dialog);
                     dialog.render();
                 }, this));*/
       },
        setInitialData: function() {
            // TODO (Ivan K): implement this
            this.initialData = _.cloneDeep(this.interfaces.toJSON());
        },
        initialize: function(options) {
            _.defaults(this, options);
            this.node = this.model.get('nodes').get(this.screenOptions[0]);
            if (this.node) {
                this.interfaces = new models.Interfaces();
                this.topologies = new models.NetworkTopologies();
                this.interfaces.fetch({
                    url: _.result(this.node, 'url') + '/attributes/interfaces'
                }).done(_.bind(function(){
                                this.setInitialData();
                                this.renderInterfaces();
                }, this))
                .fail(_.bind(this.returnToNodesTab, this));
            } else {
                this.returnToNodesTab();
            }
        },
        renderInterfaces: function() {
            this.tearDownRegisteredSubViews();
            this.$('.node-networks').html('');
            _.each(this.interfaces.models, _.bind(function(ifc) {
                var nodeInterface = new NodeInterface({
                    ifc: ifc,
                    screen: this
                });
                this.registerSubView(nodeInterface);
                this.$('.node-networks').append(nodeInterface.render().el);
                var ifNetwork;
                this.$( ".logical-network-box" ).sortable({
                    connectWith: ".connectedSortable",
                    receive: _.bind(function(event, ui){
                        var obj = $(event.target);
                        obj.children(".network-help-message").addClass("hide");
                        var ifcName = obj.parent().parent().children(".network-box-name").html();
                        this.addNetwork(ifcName, ifNetwork)
                    }, this),
                    remove: _.bind(function(event, ui){
                        var obj = $(event.target);
                        var ifcName = obj.parent().parent().children(".network-box-name").html();
                        ifNetwork = this.removeNetwork(ifcName, ui.item.html())
                        var children = obj.children(".network-help-message")
                        if (obj.children().length == 1){
                            children.removeClass("hide")
                        }
                    },this)
                }).disableSelection();

            }, this));
        },
        render: function() {
            this.$el.html(this.template({node: this.node}));
            this.renderInterfaces();
            return this;
        }
    });

    NodeInterface = Backbone.View.extend({
        template: _.template(nodeInterfacesTemplate),
        visible: false,
        events: {
        },
        initialize: function(options) {
            _.defaults(this, options);
            // TODO (Ivan K): implement this
        },
        render: function() {
            this.$el.html(this.template({
                ifc: this.ifc,
            }));
            return this;
        }
    });

    return NodesTab;
});

