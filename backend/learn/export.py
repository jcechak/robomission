"""Views and utilities for exporting data to csv.
"""
from django.shortcuts import redirect
from rest_framework import serializers
from rest_framework import viewsets
from rest_pandas import PandasViewSet
from learn.models import Block, Toolbox, Level, Task, Instruction
from learn.models import Action, Student, TaskSession, ProgramSnapshot


class BlockSerializer(serializers.ModelSerializer):
    class Meta:
        model = Block
        fields = ('id', 'name', 'order')


class BlockViewSet(PandasViewSet):
    queryset = Block.objects.all()
    serializer_class = BlockSerializer


class ToolboxSerializer(serializers.ModelSerializer):
    blocks = serializers.SlugRelatedField(slug_field='name', many=True, read_only=True)

    class Meta:
        model = Toolbox
        fields = ('id', 'name', 'blocks')


class ToolboxViewSet(PandasViewSet):
    queryset = Toolbox.objects.all().prefetch_related('blocks')
    serializer_class = ToolboxSerializer


class LevelSerializer(serializers.ModelSerializer):
    tasks = serializers.SlugRelatedField(
        slug_field='name',
        many=True,
        read_only=True)
    toolbox = serializers.SlugRelatedField(
        slug_field='name',
        many=False,
        queryset=Toolbox.objects.all())

    class Meta:
        model = Level
        fields = ('id', 'level', 'name', 'credits', 'toolbox', 'tasks')


class LevelViewSet(PandasViewSet):
    queryset = Level.objects.all().select_related('toolbox').prefetch_related('tasks')
    serializer_class = LevelSerializer


class InstructionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Instruction
        fields = ('id', 'name')


class InstructionViewSet(PandasViewSet):
    serializer_class = InstructionSerializer
    queryset = Instruction.objects.all()


class TaskSerializer(serializers.ModelSerializer):
    level = serializers.SlugRelatedField(
        slug_field='name',
        many=False,
        queryset=Level.objects.all())

    class Meta:
        model = Task
        fields = ('id', 'name', 'level', 'setting', 'solution')


class TaskViewSet(PandasViewSet):
    queryset = Task.objects.all().select_related('level')
    serializer_class = TaskSerializer


class StudentSerializer(serializers.ModelSerializer):
    credits = serializers.IntegerField(read_only=True)
    seen_instructions = serializers.SlugRelatedField(
        slug_field='name',
        many=True,
        read_only=True)

    class Meta:
        model = Student
        fields = ('id', 'credits', 'seen_instructions')


class StudentViewSet(PandasViewSet):
    queryset = Student.objects.all()
    serializer_class = StudentSerializer


class TaskSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskSession
        fields = ('id', 'student', 'task', 'solved', 'start', 'end')


class TaskSessionsViewSet(PandasViewSet):
    queryset = TaskSession.objects.all()
    serializer_class = TaskSessionSerializer


class ProgramSnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProgramSnapshot
        fields = ('id', 'task_session', 'time', 'program', 'granularity', 'correct')


class ProgramSnapshotsViewSet(PandasViewSet):
    queryset = ProgramSnapshot.objects.all()
    serializer_class = ProgramSnapshotSerializer


class ActionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Action
        fields = ('id', 'name', 'student', 'task', 'time', 'randomness', 'data')


class ActionsViewSet(PandasViewSet):
    queryset = Action.objects.all()
    serializer_class = ActionSerializer


class LatestBundleViewSet(viewsets.ViewSet):
    """Phony ViewSet to specify a custom entry in the rest API.
    """
    # DRF can't derive DjangoModelPermissions for ViewSets without a queryset,
    # so we need to explicitly define them.
    permission_classes = ()

    def list(self, request, format=None):
        return redirect('/media/exports/robomission-latest.zip')
