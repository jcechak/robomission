# -*- coding: utf-8 -*-
# Generated by Django 1.11.5 on 2017-10-14 09:07
from __future__ import unicode_literals

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('learn', '0012_tasksession'),
    ]

    operations = [
        migrations.CreateModel(
            name='ProgramSnapshot',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('time', models.DateTimeField(auto_now_add=True)),
                ('program', models.TextField()),
                ('granularity', models.CharField(choices=[('execution', 'execution'), ('edit', 'edit')], default='edit', help_text='Level of snapshoptting frequency.', max_length=10)),
                ('correct', models.NullBooleanField(default=None, help_text='Whether the snapshot is correct solution. Only applies for executions.')),
                ('task_session', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='snapshots', to='learn.TaskSession')),
            ],
        ),
    ]
